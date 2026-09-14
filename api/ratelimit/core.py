"""Sliding-window engine.

Backed by a Redis sorted set per key so limits hold across processes, with an
in-process fallback when Redis is unavailable. The window math lives in the
pure :func:`evaluate_window` so both paths — and the tests — share one
implementation.

Fail-open by design: a Redis outage already degrades run execution to inline
mode, so hard-failing requests here would take the whole product down instead
of merely weakening enforcement. The in-memory fallback still caps abuse per
process.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Sequence
from dataclasses import dataclass

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    # Seconds until the oldest counted request leaves the window.
    reset_after: float
    # Seconds the caller should wait before retrying; None when allowed.
    retry_after: float | None = None


def evaluate_window(
    prior: Sequence[float],
    now: float,
    *,
    limit: int,
    window_s: float,
    burst: int | None = None,
    burst_window_s: float = 10.0,
) -> Decision:
    """Decide whether one more request fits.

    ``prior`` holds the timestamps of previously admitted requests; entries
    older than the window are ignored, so callers may pass unpruned data.
    ``burst`` caps how many of those may fall inside the trailing
    ``burst_window_s`` — the guard that keeps a within-budget client from
    dumping its whole minute allowance in one instant.
    """
    window_start = now - window_s
    in_window = sorted(t for t in prior if t > window_start)

    if len(in_window) >= limit:
        # Wait until the oldest in-window entry expires.
        retry = max(in_window[0] - window_start, 0.0)
        return Decision(False, limit, 0, reset_after=retry, retry_after=max(retry, 1.0))

    if burst is not None:
        burst_start = now - burst_window_s
        in_burst = [t for t in in_window if t > burst_start]
        if len(in_burst) >= burst:
            retry = max(in_burst[0] - burst_start, 0.0)
            remaining = limit - len(in_window)
            return Decision(
                False, limit, remaining, reset_after=retry, retry_after=max(retry, 1.0)
            )

    remaining = limit - len(in_window) - 1
    reset_after = (in_window[0] - window_start) if in_window else window_s
    return Decision(True, limit, remaining, reset_after=reset_after)


# --------------------------------------------------------------- in-memory

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LAST_SWEEP = 0.0
_SWEEP_INTERVAL_S = 60.0


def _sweep(now: float, window_s: float) -> None:
    """Drop buckets idle for longer than the window so memory stays bounded."""
    global _LAST_SWEEP
    if now - _LAST_SWEEP < _SWEEP_INTERVAL_S:
        return
    _LAST_SWEEP = now
    cutoff = now - max(window_s, _SWEEP_INTERVAL_S)
    for key in [k for k, b in _BUCKETS.items() if not b or b[-1] <= cutoff]:
        _BUCKETS.pop(key, None)


def _memory_check(
    key: str,
    *,
    limit: int,
    window_s: float,
    burst: int | None,
    burst_window_s: float,
) -> Decision:
    now = time.monotonic()
    _sweep(now, window_s)
    bucket = _BUCKETS[key]
    while bucket and bucket[0] <= now - window_s:
        bucket.popleft()
    decision = evaluate_window(
        bucket, now, limit=limit, window_s=window_s, burst=burst, burst_window_s=burst_window_s
    )
    if decision.allowed:
        bucket.append(now)
    return decision


def reset_memory_state() -> None:
    """Test hook: clear every in-memory bucket."""
    _BUCKETS.clear()


# ------------------------------------------------------------------ redis


async def sliding_window_check(
    redis,
    key: str,
    *,
    limit: int,
    window_s: float,
    burst: int | None = None,
    burst_window_s: float = 10.0,
) -> Decision:
    """Admit-or-reject one request against ``key``.

    Redis path: optimistically ZADD the request, read the window back, and
    ZREM it again if the decision is a deny — one round trip on the hot
    (allowed) path, two on denials.
    """
    if redis is None:
        return _memory_check(
            key, limit=limit, window_s=window_s, burst=burst, burst_window_s=burst_window_s
        )

    now = time.time()
    member = f"{now:.6f}:{uuid.uuid4().hex[:8]}".encode()
    redis_key = f"floowforge:rl:{key}"
    try:
        pipe = redis.pipeline(transaction=True)
        pipe.zremrangebyscore(redis_key, 0, now - window_s)
        pipe.zadd(redis_key, {member: now})
        pipe.zrange(redis_key, 0, -1, withscores=True)
        pipe.pexpire(redis_key, int(window_s * 1000) + 1000)
        _, _, entries, _ = await pipe.execute()
        prior = [score for entry, score in entries if entry != member]
        decision = evaluate_window(
            prior, now, limit=limit, window_s=window_s, burst=burst, burst_window_s=burst_window_s
        )
        if not decision.allowed:
            await redis.zrem(redis_key, member)
        return decision
    except Exception as exc:  # pragma: no cover - exercised via FakeRedis errors
        log.warning("Redis rate limit unavailable, using local buckets: %s", exc)
        return _memory_check(
            key, limit=limit, window_s=window_s, burst=burst, burst_window_s=burst_window_s
        )
