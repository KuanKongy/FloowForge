"""Per-user provider credentials.

In v1 we store credentials as a JSON blob in `encrypted_credentials`. For
production, wire pgsodium / Supabase Vault to encrypt at rest; the API server
reads via the service role and decrypts before each run.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUserDep
from ..schemas import IntegrationCreate, IntegrationUpdate

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(user: CurrentUserDep):
    rows = await user.db.select(
        "integrations",
        params={"select": "id,user_id,provider,label,created_at"},
    )
    return rows


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_integration(body: IntegrationCreate, user: CurrentUserDep):
    payload = {
        "user_id": user.id,
        "provider": body.provider,
        "label": body.label,
        "encrypted_credentials": json.dumps(body.credentials),
    }
    rows = await user.db.insert("integrations", payload)
    row = rows[0]
    row.pop("encrypted_credentials", None)
    return row


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(integration_id: str, user: CurrentUserDep):
    await user.db.delete("integrations", params={"id": f"eq.{integration_id}"})


@router.patch("/{integration_id}")
async def update_integration(
    integration_id: str,
    body: IntegrationUpdate,
    user: CurrentUserDep,
):
    payload: dict[str, str] = {}
    if body.label is not None:
        payload["label"] = body.label
    if body.credentials is not None:
        payload["encrypted_credentials"] = json.dumps(body.credentials)
    if not payload:
        raise HTTPException(400, "Empty update")

    rows = await user.db.update(
        "integrations",
        payload,
        params={"id": f"eq.{integration_id}", "user_id": f"eq.{user.id}"},
    )
    if not rows:
        raise HTTPException(404, "Integration not found")
    row = rows[0]
    row.pop("encrypted_credentials", None)
    return row
