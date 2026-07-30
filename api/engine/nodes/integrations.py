"""Helpers for resolving per-user provider credentials at execution time."""
from __future__ import annotations

from typing import Any

from ...crypto import decrypt_credentials
from ..context import ExecutionContext


async def apply_integration_options(
    data: dict[str, Any],
    ctx: ExecutionContext,
    options: dict[str, Any],
) -> dict[str, Any]:
    integration_id = data.get("integration_id")
    if not integration_id:
        return options

    row = await ctx.db.select(
        "integrations",
        params={
            "id": f"eq.{integration_id}",
            "user_id": f"eq.{ctx.user_id}",
            "select": "*",
        },
        single=True,
    )
    if not row:
        raise ValueError("Selected integration was not found.")

    raw = row.get("encrypted_credentials")
    credentials: dict[str, Any] = {}
    if isinstance(raw, dict):
        credentials = raw
    elif isinstance(raw, str) and raw:
        try:
            credentials = decrypt_credentials(raw)
        except Exception as exc:
            # Never surface the cause: it would end up in `runs.error`.
            raise ValueError("Stored credentials for this integration could not be read.") from exc

    return {
        **options,
        "credential_source": "user",
        "integration_id": integration_id,
        "provider_credentials": credentials,
    }
