"""Auth dependency: validates the Supabase access token and returns user id."""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings
from .db import SupabaseClient
from .supabase_url import normalize_supabase_url



def _merge_session_schema_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_session_schema_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

class CurrentUser:
    def __init__(self, user_id: str, access_token: str):
        self.id = user_id
        self.access_token = access_token

    @property
    def db(self) -> SupabaseClient:
        return SupabaseClient.as_user(self.access_token)



def _summarize_session_layout_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'session'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_session_layout_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed


class _SessionAccountEnvelope:
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

def _parse_session_panel_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_session_panel_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped


def _collect_session_edge_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_session_edge_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

