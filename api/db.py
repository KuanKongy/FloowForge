"""Thin async HTTP wrapper around Supabase REST + Realtime broadcast.

We intentionally avoid the official `supabase` Python package because it is sync
and uses `postgrest`. For our needs (an async API + worker), a tiny httpx client
that calls PostgREST and the Realtime broadcast endpoint is enough.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import get_settings
from .supabase_url import normalize_supabase_url

log = logging.getLogger(__name__)


def _raise_with_supabase_body(r: httpx.Response, *, op: str, table: str | None = None) -> None:
    """Surface PostgREST error details in API logs and exception messages.

    Vanilla ``r.raise_for_status()`` produces "Client error '400 Bad Request' ..."
    which hides the actual Supabase reason (e.g. ``column "start_node_ids" does
    not exist`` when migration 0004 hasn't been applied). This helper logs the
    truncated response body and re-raises a ``HTTPStatusError`` whose message
    embeds it, so callers can show users a meaningful error.
    """
    if r.is_success:
        return
    body = (r.text or "").strip()
    snippet = body[:600]
    target = f"{op} {table}" if table else op
    log.warning(
        "Supabase %s -> %s %s: %s",
        target,
        r.status_code,
        r.reason_phrase or "",
        snippet,
    )
    # Re-raise so callers that don't catch the body still get an exception, but
    # with the helpful body baked into the message.
    request = r.request
    raise httpx.HTTPStatusError(
        f"Supabase {target} returned {r.status_code}: {snippet}",
        request=request,
        response=r,
    )


def _service_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _user_headers(access_token: str) -> dict[str, str]:
    settings = get_settings()
    return {
        "apikey": settings.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _supabase_root() -> str:
    settings = get_settings()
    return normalize_supabase_url(settings.SUPABASE_URL)


class SupabaseClient:
    """Per-request Supabase REST client. Use `as_user` for RLS-respecting calls
    and `as_service` for the worker / scheduler / public webhook router."""

    def __init__(self, access_token: str | None = None, *, service: bool = False):
        if not service and access_token is None:
            raise ValueError("access_token required when service=False")
        self._service = service
        self._access_token = access_token

    @classmethod
    def as_user(cls, access_token: str) -> "SupabaseClient":
        return cls(access_token=access_token, service=False)

    @classmethod
    def as_service(cls) -> "SupabaseClient":
        return cls(service=True)

    @property
    def _headers(self) -> dict[str, str]:
        return _service_headers() if self._service else _user_headers(self._access_token or "")

    @property
    def _base(self) -> str:
        return f"{_supabase_root()}/rest/v1"

    async def select(
        self,
        table: str,
        *,
        params: dict[str, str] | None = None,
        single: bool = False,
    ) -> Any:
        url = f"{self._base}/{table}"
        headers = dict(self._headers)
        if single:
            headers["Accept"] = "application/vnd.pgrst.object+json"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, headers=headers, params=params)
            _raise_with_supabase_body(r, op="select", table=table)
            return r.json()

    async def insert(
        self,
        table: str,
        body: dict[str, Any] | list[dict[str, Any]],
        *,
        returning: bool = True,
    ) -> Any:
        url = f"{self._base}/{table}"
        headers = dict(self._headers)
        headers["Prefer"] = "return=representation" if returning else "return=minimal"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, headers=headers, json=body)
            _raise_with_supabase_body(r, op="insert", table=table)
            return r.json() if returning else None

    async def update(
        self,
        table: str,
        body: dict[str, Any],
        *,
        params: dict[str, str],
        returning: bool = True,
    ) -> Any:
        url = f"{self._base}/{table}"
        headers = dict(self._headers)
        headers["Prefer"] = "return=representation" if returning else "return=minimal"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.patch(url, headers=headers, params=params, json=body)
            _raise_with_supabase_body(r, op="update", table=table)
            return r.json() if returning else None

    async def delete(self, table: str, *, params: dict[str, str]) -> None:
        url = f"{self._base}/{table}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.delete(url, headers=self._headers, params=params)
            _raise_with_supabase_body(r, op="delete", table=table)

    async def rpc(self, name: str, args: dict[str, Any]) -> Any:
        url = f"{self._base}/rpc/{name}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, headers=self._headers, json=args)
            _raise_with_supabase_body(r, op=f"rpc:{name}")
            return r.json() if r.text else None


async def realtime_broadcast(channel: str, event: str, payload: dict[str, Any]) -> None:
    """Send a Realtime broadcast message. Subscribed clients in the same channel
    receive it instantly, regardless of database state.

    Best-effort: every emitted event is also persisted to ``run_events``, so a
    broadcast failure must never abort a run. We log non-2xx responses so
    misconfiguration is visible in server logs.
    """
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    url = f"{_supabase_root()}/realtime/v1/api/broadcast"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "messages": [
            {"topic": channel, "event": event, "payload": payload}
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("realtime_broadcast %s/%s failed: %s", channel, event, exc)

def _shape_db_detail_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_db_detail_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_db_detail_row(row) for row in rows]

