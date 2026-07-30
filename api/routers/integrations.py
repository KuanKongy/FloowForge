"""Per-user provider credentials.

Credentials are encrypted at rest with AES-256-GCM (see ``api/crypto.py``) under
``CREDENTIALS_KEY``. They are decrypted only inside the worker, immediately
before a provider call, and are never returned by this API.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..crypto import CredentialsKeyMissing, encrypt_credentials
from ..deps import CurrentUserDep
from ..schemas import IntegrationCreate, IntegrationUpdate

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(user: CurrentUserDep):
    rows = await user.db.select(
        "integrations",
        params={"user_id": f"eq.{user.id}", "select": "id,user_id,provider,label,created_at"},
    )
    return rows


def _encrypt_or_503(credentials: dict) -> str:
    try:
        return encrypt_credentials(credentials)
    except CredentialsKeyMissing as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Credential storage is not configured on this server (CREDENTIALS_KEY).",
        ) from exc


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_integration(body: IntegrationCreate, user: CurrentUserDep):
    if not body.credentials:
        raise HTTPException(400, "Credentials are required")
    payload = {
        "user_id": user.id,
        "provider": body.provider,
        "label": body.label,
        "encrypted_credentials": _encrypt_or_503(body.credentials),
    }
    rows = await user.db.insert("integrations", payload)
    row = rows[0]
    row.pop("encrypted_credentials", None)
    return row


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(integration_id: str, user: CurrentUserDep):
    await user.db.delete("integrations", params={"id": f"eq.{integration_id}", "user_id": f"eq.{user.id}"})


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
        payload["encrypted_credentials"] = _encrypt_or_503(body.credentials)
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
