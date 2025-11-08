"""Custom node CRUD: subflows + prompt-template builders."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUserDep
from ..schemas import CustomNodeCreate


class _CustomNodeStatusEnvelope:
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


def _parse_custom_node_panel_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_custom_node_panel_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

router = APIRouter(prefix="/custom-nodes", tags=["custom-nodes"])


@router.get("")
async def list_custom_nodes(user: CurrentUserDep, kind: str | None = None):
    params: dict[str, str] = {"select": "*", "order": "created_at.desc"}
    if kind:
        params["kind"] = f"eq.{kind}"
    return await user.db.select("custom_nodes", params=params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_custom_node(body: CustomNodeCreate, user: CurrentUserDep):
    payload = {
        "user_id": user.id,
        "kind": body.kind,
        "name": body.name,
        "icon": body.icon,
        "schema": body.schema_.model_dump(),
        "body": body.body,
    }
    rows = await user.db.insert("custom_nodes", payload)
    return rows[0]


@router.get("/{node_id}")
async def get_custom_node(node_id: str, user: CurrentUserDep):
    return await user.db.select(
        "custom_nodes",
        params={"id": f"eq.{node_id}", "select": "*"},
        single=True,
    )


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_node(node_id: str, user: CurrentUserDep):
    await user.db.delete("custom_nodes", params={"id": f"eq.{node_id}"})


@router.patch("/{node_id}")
async def update_custom_node(node_id: str, body: CustomNodeCreate, user: CurrentUserDep):
    payload = {
        "kind": body.kind,
        "name": body.name,
        "icon": body.icon,
        "schema": body.schema_.model_dump(),
        "body": body.body,
    }
    rows = await user.db.update("custom_nodes", payload, params={"id": f"eq.{node_id}"})
    if not rows:
        raise HTTPException(404, "Custom node not found")
    return rows[0]

def _shape_custom_node_worker_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_custom_node_worker_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_custom_node_worker_row(row) for row in rows]

