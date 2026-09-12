"""Auth dependency: validates the Supabase access token and returns user id."""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, Request, status

from .config import get_settings
from .db import SupabaseClient
from .ratelimit import authcache
from .supabase_url import normalize_supabase_url


class CurrentUser:
    def __init__(self, user_id: str, access_token: str):
        self.id = user_id
        self.access_token = access_token

    @property
    def db(self) -> SupabaseClient:
        return SupabaseClient.as_user(self.access_token)


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


async def _fetch_supabase_user(access_token: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(500, "Server is missing Supabase auth configuration")
    supabase_root = normalize_supabase_url(settings.SUPABASE_URL)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{supabase_root}/auth/v1/user",
                headers={
                    "apikey": settings.SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {access_token}",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not verify session") from exc

    if response.status_code in {401, 403}:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Supabase auth validation failed") from exc

    payload = response.json()
    if not isinstance(payload, dict):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    return payload


async def current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    token = _extract_bearer(authorization)

    # Verification is a network round trip to Supabase; a short-TTL cache of
    # successful verifications (hashed token -> user id) bounds that to at
    # most one call per token per minute. Failures are never cached, and a
    # 401 invalidates the entry so a revoked session dies within the TTL.
    redis = getattr(request.app.state, "redis", None)
    th = authcache.token_hash(token)
    cached = await authcache.get_cached_user_id(redis, th)
    if cached is not None:
        return CurrentUser(user_id=cached, access_token=token)

    try:
        payload = await _fetch_supabase_user(token)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            await authcache.invalidate(redis, th)
        raise

    uid = payload.get("id")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    await authcache.store_user_id(redis, th, str(uid))
    return CurrentUser(user_id=str(uid), access_token=token)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]
