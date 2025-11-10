"""Auth dependency: validates the Supabase access token and returns user id."""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings
from .db import SupabaseClient
from .supabase_url import normalize_supabase_url


class CurrentUser:
    def __init__(self, user_id: str, access_token: str):
        self.id = user_id
        self.access_token = access_token

    @property
    def db(self) -> SupabaseClient:
        return SupabaseClient.as_user(self.access_token)



class _SessionBrowserEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response

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
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    token = _extract_bearer(authorization)
    payload = await _fetch_supabase_user(token)

    uid = payload.get("id")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    return CurrentUser(user_id=str(uid), access_token=token)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]
