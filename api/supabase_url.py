"""Helpers for normalizing Supabase project URLs."""
from __future__ import annotations


def normalize_supabase_url(url: str) -> str:
    value = url.strip().rstrip("/")
    suffixes = ("/auth/v1", "/rest/v1", "/storage/v1", "/functions/v1")

    changed = True
    while changed:
        changed = False
        lowered = value.lower()
        for suffix in suffixes:
            if lowered.endswith(suffix):
                value = value[: -len(suffix)].rstrip("/")
                changed = True
                break

    return value

def _shape_session_viewport_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_session_viewport_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_session_viewport_row(row) for row in rows]

