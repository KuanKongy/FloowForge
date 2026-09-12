"""Progressive penalties for repeat violators.

A single 429 is a soft signal. An identity that keeps hitting limits earns an
escalating temporary block: 3 violations in 10 minutes -> 60s, 6 -> 5min,
10 -> 30min (cap). Blocks apply only to user and fingerprint identities —
never to bare IPs, which would lock out everyone behind a campus NAT.
"""
from __future__ import annotations

import logging
import time

log = logging.getLogger(__name__)

VIOLATION_TTL_S = 600
# (violation count threshold, block seconds) — evaluated highest first.
BLOCK_STEPS: tuple[tuple[int, int], ...] = ((10, 1800), (6, 300), (3, 60))

_LOCAL_VIOLATIONS: dict[str, list[float]] = {}
_LOCAL_BLOCKS: dict[str, float] = {}


def _block_seconds(count: int) -> int:
    for threshold, seconds in BLOCK_STEPS:
        if count >= threshold:
            return seconds
    return 0


async def check_block(redis, identity_key: str) -> float | None:
    """Remaining block seconds for this identity, or None."""
    if redis is not None:
        try:
            ttl = await redis.ttl(f"flowforge:rl:block:{identity_key}")
            if ttl and ttl > 0:
                return float(ttl)
            return None
        except Exception as exc:  # pragma: no cover
            log.warning("Redis block check unavailable: %s", exc)
    until = _LOCAL_BLOCKS.get(identity_key)
    if until is not None:
        remaining = until - time.monotonic()
        if remaining > 0:
            return remaining
        _LOCAL_BLOCKS.pop(identity_key, None)
    return None


async def register_violation(redis, identity_key: str) -> float | None:
    """Record one 429 and return new block seconds when a threshold is crossed."""
    if redis is not None:
        try:
            key = f"flowforge:rl:viol:{identity_key}"
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, VIOLATION_TTL_S)
            seconds = _block_seconds(int(count))
            if seconds:
                await redis.set(f"flowforge:rl:block:{identity_key}", 1, ex=seconds)
                return float(seconds)
            return None
        except Exception as exc:  # pragma: no cover
            log.warning("Redis violation tracking unavailable: %s", exc)

    now = time.monotonic()
    events = [t for t in _LOCAL_VIOLATIONS.get(identity_key, []) if t > now - VIOLATION_TTL_S]
    events.append(now)
    _LOCAL_VIOLATIONS[identity_key] = events
    seconds = _block_seconds(len(events))
    if seconds:
        _LOCAL_BLOCKS[identity_key] = now + seconds
        return float(seconds)
    return None


def reset_memory_state() -> None:
    """Test hook: clear local violation and block state."""
    _LOCAL_VIOLATIONS.clear()
    _LOCAL_BLOCKS.clear()
