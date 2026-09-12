"""Short-TTL cache of Supabase access token -> user id.

Token verification is a network round trip to Supabase on every authenticated
request; caching the (hashed) token for 60 seconds cuts that to at most one
verification per token per minute. Only successful verifications are cached,
and a 401 from Supabase invalidates the entry immediately, so a revoked
session lives at most 60 seconds — the same order as the access token's own
refresh cadence.

The rate-limit middleware also *peeks* this cache to attribute requests to a
user before auth runs, without ever performing a verification itself.
"""
from __future__ import annotations

import hashlib
import logging
import time

log = logging.getLogger(__name__)

TTL_S = 60
_LOCAL_MAX = 2048

# token hash -> (expires_at_monotonic, user_id)
_LOCAL: dict[str, tuple[float, str]] = {}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _redis_key(th: str) -> str:
    return f"flowforge:auth:{th}"


def _local_get(th: str) -> str | None:
    entry = _LOCAL.get(th)
    if entry is None:
        return None
    expires, user_id = entry
    if expires <= time.monotonic():
        _LOCAL.pop(th, None)
        return None
    return user_id


def _local_set(th: str, user_id: str) -> None:
    if len(_LOCAL) >= _LOCAL_MAX:
        # Drop the soonest-to-expire entries; simple and rare.
        for key in sorted(_LOCAL, key=lambda k: _LOCAL[k][0])[: _LOCAL_MAX // 4]:
            _LOCAL.pop(key, None)
    _LOCAL[th] = (time.monotonic() + TTL_S, user_id)


async def get_cached_user_id(redis, th: str) -> str | None:
    user_id = _local_get(th)
    if user_id is not None:
        return user_id
    if redis is not None:
        try:
            raw = await redis.get(_redis_key(th))
            if raw:
                user_id = raw.decode() if isinstance(raw, bytes) else str(raw)
                _local_set(th, user_id)
                return user_id
        except Exception as exc:  # pragma: no cover
            log.warning("Redis auth cache read failed: %s", exc)
    return None


async def store_user_id(redis, th: str, user_id: str) -> None:
    _local_set(th, user_id)
    if redis is not None:
        try:
            await redis.set(_redis_key(th), user_id, ex=TTL_S)
        except Exception as exc:  # pragma: no cover
            log.warning("Redis auth cache write failed: %s", exc)


async def invalidate(redis, th: str) -> None:
    _LOCAL.pop(th, None)
    if redis is not None:
        try:
            await redis.delete(_redis_key(th))
        except Exception as exc:  # pragma: no cover
            log.warning("Redis auth cache delete failed: %s", exc)


def reset_memory_state() -> None:
    """Test hook: clear the local cache."""
    _LOCAL.clear()
