"""Route-level rate-limit dependencies.

The global middleware already applies the IP pre-check and a per-identity
default; these dependencies add tighter budgets for specific route classes
(run creation, PDF parsing, public trigger endpoints) and stamp their own,
more specific ``RateLimit-*`` headers.
"""
from __future__ import annotations

import math

from fastapi import Depends, HTTPException, Request, Response, status

from ..config import get_settings
from ..deps import CurrentUser, current_user
from . import penalties, policies
from .core import Decision, sliding_window_check
from .identity import Identity, client_ip, identify
from .policies import Policy


def _stamp(response: Response | None, decision: Decision) -> None:
    if response is None:
        return
    response.headers["RateLimit-Limit"] = str(decision.limit)
    response.headers["RateLimit-Remaining"] = str(max(decision.remaining, 0))
    response.headers["RateLimit-Reset"] = str(math.ceil(decision.reset_after))


async def _enforce(
    request: Request,
    response: Response | None,
    policy: Policy,
    key_basis: str,
    *,
    violator: Identity | None = None,
) -> Decision:
    """Run one window check; raise 429 (with headers) on deny."""
    redis = getattr(request.app.state, "redis", None)
    decision = await sliding_window_check(
        redis,
        f"{policy.name}:{key_basis}",
        limit=policy.limit,
        window_s=policy.window_s,
        burst=policy.burst,
        burst_window_s=policy.burst_window_s,
    )
    if decision.allowed:
        _stamp(response, decision)
        return decision

    retry = decision.retry_after or 1.0
    if violator is not None and violator.blockable:
        block = await penalties.register_violation(redis, violator.key)
        if block is not None:
            retry = max(retry, block)
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "Rate limit exceeded",
        headers={
            "RateLimit-Limit": str(decision.limit),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": str(math.ceil(decision.reset_after)),
            "Retry-After": str(max(math.ceil(retry), 1)),
        },
    )


def _enabled() -> bool:
    return get_settings().RATE_LIMIT_ENABLED


def rate_limit(*, max_calls: int, window_s: float):
    """Per-authenticated-user limiter (compatible with the old signature)."""
    policy = Policy(f"user-{max_calls}-{int(window_s)}", max_calls, window_s)

    async def _dep(
        request: Request,
        response: Response,
        user: CurrentUser = Depends(current_user),
    ) -> CurrentUser:
        if _enabled():
            route = request.scope.get("route")
            path = getattr(route, "path", request.url.path)
            identity = Identity("user", f"user:{user.id}")
            await _enforce(
                request, response, policy, f"{identity.key}:{path}", violator=identity
            )
        return user

    return _dep


def run_rate_limit():
    """Run creation: the per-minute budget plus an hourly AI-spend cap."""

    async def _dep(
        request: Request,
        response: Response,
        user: CurrentUser = Depends(current_user),
    ) -> CurrentUser:
        if _enabled():
            identity = Identity("user", f"user:{user.id}")
            await _enforce(
                request,
                response,
                policies.expensive_run_hourly(),
                identity.key,
                violator=identity,
            )
            await _enforce(
                request, response, policies.EXPENSIVE_RUN, identity.key, violator=identity
            )
        return user

    return _dep


def public_rate_limit(*, max_calls: int, window_s: float):
    """Anonymous limiter keyed on device fingerprint, falling back to IP."""
    policy = Policy(f"public-{max_calls}-{int(window_s)}", max_calls, window_s)

    async def _dep(request: Request, response: Response) -> None:
        if not _enabled():
            return
        hops = get_settings().TRUSTED_PROXY_HOPS
        identity = identify(request, trusted_proxy_hops=hops)
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        await _enforce(request, response, policy, f"{identity.key}:{path}", violator=identity)

    return _dep


def public_submit_limit():
    """Public webhook/form submissions.

    Three windows: per device (strict), per IP (loose NAT co-limit so a
    distributed flood from one network is still bounded), and per token so a
    leaked link cannot exhaust the owner's provider keys no matter how many
    devices hit it.
    """

    async def _dep(token: str, request: Request, response: Response) -> None:
        if not _enabled():
            return
        hops = get_settings().TRUSTED_PROXY_HOPS
        identity = identify(request, trusted_proxy_hops=hops)
        ip = client_ip(request, trusted_proxy_hops=hops)
        await _enforce(
            request, response, policies.PUBLIC_SUBMIT_TOKEN, f"token:{token}", violator=None
        )
        await _enforce(request, response, policies.PUBLIC_SUBMIT_IP, f"ip:{ip}", violator=None)
        await _enforce(
            request, response, policies.PUBLIC_SUBMIT, identity.key, violator=identity
        )

    return _dep


def public_read_limit():
    """Public trigger reads: per device, with a loose per-IP co-limit."""

    async def _dep(request: Request, response: Response) -> None:
        if not _enabled():
            return
        hops = get_settings().TRUSTED_PROXY_HOPS
        identity = identify(request, trusted_proxy_hops=hops)
        ip = client_ip(request, trusted_proxy_hops=hops)
        await _enforce(request, response, policies.PUBLIC_READ_IP, f"ip:{ip}", violator=None)
        await _enforce(request, response, policies.PUBLIC_READ, identity.key, violator=identity)

    return _dep
