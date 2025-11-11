"""Custom node CRUD: prompt-template builders."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUserDep
from ..schemas import CustomNodeCreate, CustomNodeUpdate

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
async def update_custom_node(node_id: str, body: CustomNodeUpdate, user: CurrentUserDep):
    payload: dict = {}
    if body.name is not None:
        payload["name"] = body.name
    if body.icon is not None:
        payload["icon"] = body.icon
    if body.schema_ is not None:
        payload["schema"] = body.schema_.model_dump()
    if body.body is not None:
        payload["body"] = body.body
    if not payload:
        raise HTTPException(400, "Empty update")
    rows = await user.db.update("custom_nodes", payload, params={"id": f"eq.{node_id}"})
    if not rows:
        raise HTTPException(404, "Custom node not found")
    return rows[0]
