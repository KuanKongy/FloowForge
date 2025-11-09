"""Token-bucket-ish per-user rate limiter.

In-memory only. For multi-instance prod, swap for a Redis implementation
backed by INCR + EXPIRE on a per-user-per-window key.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from ..deps import CurrentUser, current_user

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(*, max_calls: int, window_s: float):
    async def _dep(request: Request, user: CurrentUser = Depends(current_user)):
        key = f"{user.id}:{request.url.path}"
        bucket = _BUCKETS[key]
        now = time.monotonic()
        while bucket and bucket[0] <= now - window_s:
            bucket.popleft()
        if len(bucket) >= max_calls:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Rate limit exceeded")
        bucket.append(now)
        return user

    return _dep
