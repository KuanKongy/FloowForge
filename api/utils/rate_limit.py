"""Sliding-window rate limiting.

Backed by Redis when it is available (``request.app.state.redis``) so limits hold
across API replicas, with an in-process fallback for dev and tests.

The in-process buckets are swept periodically so ``_BUCKETS`` cannot grow without
bound — the previous implementation kept one deque per user-path forever.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from ..deps import CurrentUser, current_user

log = logging.getLogger(__name__)

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LAST_SWEEP = 0.0
_SWEEP_INTERVAL_S = 60.0


def _sweep(now: float, window_s: float) -> None:
    """Drop buckets that have been idle for longer than the window."""
    global _LAST_SWEEP
    if now - _LAST_SWEEP < _SWEEP_INTERVAL_S:
        return
    _LAST_SWEEP = now
    cutoff = now - max(window_s, _SWEEP_INTERVAL_S)
    for key in [k for k, b in _BUCKETS.items() if not b or b[-1] <= cutoff]:
        _BUCKETS.pop(key, None)


async def _allow(request: Request, key: str, max_calls: int, window_s: float) -> bool:
    """Return True when the call is within the limit."""
    redis = getattr(request.app.state, "redis", None)
    if redis is not None:
        # Fixed-window counter: one INCR plus an EXPIRE on first write.
        bucket = int(time.time() // window_s)
        redis_key = f"flowforge:rl:{key}:{bucket}"
        try:
            count = await redis.incr(redis_key)
            if count == 1:
                await redis.expire(redis_key, int(window_s) + 1)
            return count <= max_calls
        except Exception as exc:  # pragma: no cover - falls through to local
            log.warning("Redis rate limit unavailable, using local buckets: %s", exc)

    now = time.monotonic()
    _sweep(now, window_s)
    bucket_local = _BUCKETS[key]
    while bucket_local and bucket_local[0] <= now - window_s:
        bucket_local.popleft()
    if len(bucket_local) >= max_calls:
        return False
    bucket_local.append(now)
    return True


def rate_limit(*, max_calls: int, window_s: float):
    """Per-authenticated-user limiter."""

    async def _dep(request: Request, user: CurrentUser = Depends(current_user)):
        key = f"{user.id}:{request.url.path}"
        if not await _allow(request, key, max_calls, window_s):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Rate limit exceeded")
        return user

    return _dep


def public_rate_limit(*, max_calls: int, window_s: float):
    """Per-client-IP limiter for unauthenticated routes.

    Public webhook and form endpoints previously had no limit at all, so a leaked
    URL token allowed unbounded runs against the owner's provider keys.
    """

    async def _dep(request: Request) -> None:
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        key = f"ip:{_client_ip(request)}:{path}"
        if not await _allow(request, key, max_calls, window_s):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Rate limit exceeded")

    return _dep


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
