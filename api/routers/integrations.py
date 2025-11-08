"""Per-user provider credentials.

In v1 we store credentials as a JSON blob in `encrypted_credentials`. For
production, wire pgsodium / Supabase Vault to encrypt at rest; the API server
reads via the service role and decrypts before each run.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, status

from ..deps import CurrentUserDep
from ..schemas import IntegrationCreate


class _IntegrationStatusEnvelope:
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

def _shape_integration_worker_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_integration_worker_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_integration_worker_row(row) for row in rows]

