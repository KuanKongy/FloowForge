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
