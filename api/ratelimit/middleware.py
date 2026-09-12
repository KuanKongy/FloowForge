"""Global rate-limit middleware.

Runs before any route handler (and before token verification, which costs a
Supabase round trip), enforcing two coarse layers:

1. an IP pre-check — huge, exists only to stop raw floods, and never earns a
   temp block since a campus NAT shares one IP across hundreds of users;
2. a global default keyed on the best identity (cached user > device
   fingerprint > IP).

Route-specific limits (runs, media, public triggers) stay in
``api.ratelimit.dependencies``. Every response carries draft-IETF
``RateLimit-*`` headers; 429s add ``Retry-After``. The middleware also feeds
the client-signal event log.
"""
from __future__ import annotations

import logging
import math

from fastapi import Request
from fastapi.responses import JSONResponse

from ..config import get_settings
from . import authcache, events, penalties, policies
from .core import Decision, sliding_window_check
from .identity import CLIENT_ID_HEADER, CLIENT_TZ_HEADER, client_ip, identify

log = logging.getLogger(__name__)

EXEMPT_PATHS = {"/health"}


def _headers(decision: Decision) -> dict[str, str]:
    return {
        "RateLimit-Limit": str(decision.limit),
        "RateLimit-Remaining": str(max(decision.remaining, 0)),
        "RateLimit-Reset": str(math.ceil(decision.reset_after)),
    }


def _reject(decision: Decision, retry_after: float) -> JSONResponse:
    headers = _headers(decision)
    headers["Retry-After"] = str(max(math.ceil(retry_after), 1))
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
        headers=headers,
    )


async def dispatch(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in EXEMPT_PATHS:
        return await call_next(request)

    settings = get_settings()
    redis = getattr(request.app.state, "redis", None)

    # Attribute the request without verifying the token: peek the auth cache
    # only. Verification stays in `current_user`, after these cheap checks.
    token_h: str | None = None
    user_id: str | None = None
    authorization = request.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        token_h = authcache.token_hash(authorization.split(" ", 1)[1].strip())
        user_id = await authcache.get_cached_user_id(redis, token_h)

    hops = settings.TRUSTED_PROXY_HOPS
    identity = identify(request, user_id=user_id, trusted_proxy_hops=hops)
    ip = client_ip(request, trusted_proxy_hops=hops)

    decision: Decision | None = None
    if settings.RATE_LIMIT_ENABLED:
        if identity.blockable:
            blocked_for = await penalties.check_block(redis, identity.key)
            if blocked_for is not None:
                response = _reject(Decision(False, 0, 0, blocked_for), blocked_for)
                await _log_event(request, response.status_code, user_id, ip, settings, redis)
                return response

        ip_policy = policies.ip_precheck()
        ip_decision = await sliding_window_check(
            redis,
            f"{ip_policy.name}:{ip}",
            limit=ip_policy.limit,
            window_s=ip_policy.window_s,
            burst=ip_policy.burst,
            burst_window_s=ip_policy.burst_window_s,
        )
        if not ip_decision.allowed:
            # Deliberately no violation tracking: never escalate on bare IPs.
            response = _reject(ip_decision, ip_decision.retry_after or 1.0)
            await _log_event(request, response.status_code, user_id, ip, settings, redis)
            return response

        policy = policies.global_default()
        decision = await sliding_window_check(
            redis,
            f"{policy.name}:{identity.key}",
            limit=policy.limit,
            window_s=policy.window_s,
            burst=policy.burst,
            burst_window_s=policy.burst_window_s,
        )
        if not decision.allowed:
            retry = decision.retry_after or 1.0
            if identity.blockable:
                block = await penalties.register_violation(redis, identity.key)
                if block is not None:
                    retry = max(retry, block)
            response = _reject(decision, retry)
            await _log_event(request, response.status_code, user_id, ip, settings, redis)
            return response

    response = await call_next(request)

    # Route-level limiters set more specific headers; don't clobber them.
    if decision is not None and "RateLimit-Limit" not in response.headers:
        for key, value in _headers(decision).items():
            response.headers[key] = value

    # The route's auth dependency may have resolved (and cached) the user
    # while handling the request; re-peek so the event is attributed.
    if user_id is None and token_h is not None:
        user_id = await authcache.get_cached_user_id(redis, token_h)
    await _log_event(request, response.status_code, user_id, ip, settings, redis)
    return response


async def _log_event(request: Request, status: int, user_id, ip, settings, redis) -> None:
    if not settings.CLIENT_EVENTS_ENABLED:
        return
    # The route template (not the raw URL) keeps tokens out of the log.
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    if not events.should_log(
        request.method, status, path, sample_rate=settings.CLIENT_EVENT_SAMPLE_RATE
    ):
        return
    from .identity import fingerprint_from_header

    event = events.build_event(
        method=request.method,
        path=path,
        status=status,
        user_id=user_id,
        ip=ip,
        fingerprint=fingerprint_from_header(request.headers.get(CLIENT_ID_HEADER)),
        user_agent=request.headers.get("user-agent"),
        lang=request.headers.get("accept-language"),
        tz=request.headers.get(CLIENT_TZ_HEADER),
    )
    await events.record_event(redis, event)
