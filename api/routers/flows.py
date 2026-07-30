"""Flow CRUD + immutable version snapshots."""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUserDep
from ..schemas import FlowCreate, FlowUpdate, FlowVersionCreate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/flows", tags=["flows"])


@router.get("")
async def list_flows(user: CurrentUserDep, is_subflow: bool | None = None):
    params: dict[str, str] = {"select": "*", "order": "updated_at.desc"}
    if is_subflow is not None:
        params["is_subflow"] = f"eq.{str(is_subflow).lower()}"
    return await user.db.select("flows", params=params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_flow(body: FlowCreate, user: CurrentUserDep):
    rows = await user.db.insert(
        "flows",
        {**body.model_dump(), "user_id": user.id},
    )
    flow = rows[0]
    # Create v1 with empty graph so the editor has somewhere to write.
    versions = await user.db.insert(
        "flow_versions",
        {"flow_id": flow["id"], "version": 1},
    )
    version = versions[0]
    await user.db.update(
        "flows",
        {"current_version_id": version["id"]},
        params={"id": f"eq.{flow['id']}"},
    )
    flow["current_version_id"] = version["id"]
    return flow


@router.get("/{flow_id}")
async def get_flow(flow_id: str, user: CurrentUserDep):
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "*"},
        single=True,
    )
    versions = await user.db.select(
        "flow_versions",
        params={
            "flow_id": f"eq.{flow_id}",
            "select": "*",
            "order": "version.desc",
            "limit": "20",
        },
    )
    return {"flow": flow, "versions": versions}


@router.patch("/{flow_id}")
async def update_flow(flow_id: str, body: FlowUpdate, user: CurrentUserDep):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(400, "Empty update")
    rows = await user.db.update("flows", payload, params={"id": f"eq.{flow_id}"})
    if not rows:
        raise HTTPException(404, "Flow not found")
    return rows[0]


@router.delete("/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flow(flow_id: str, user: CurrentUserDep):
    await user.db.delete("flows", params={"id": f"eq.{flow_id}"})


@router.post("/{flow_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version(flow_id: str, body: FlowVersionCreate, user: CurrentUserDep):
    """Snapshot the working graph as a new immutable version."""
    payload = {
        "flow_id": flow_id,
        "graph": body.graph.model_dump(),
        "inputs": [p.model_dump() for p in body.inputs],
        "outputs": [p.model_dump() for p in body.outputs],
    }

    # `version` is read-then-written, so two concurrent saves compute the same
    # number and collide with unique(flow_id, version). Retry on conflict rather
    # than surfacing a 500 to someone who just pressed Save twice.
    version = None
    last_error: Exception | None = None
    for _ in range(5):
        existing = await user.db.select(
            "flow_versions",
            params={
                "flow_id": f"eq.{flow_id}",
                "select": "version",
                "order": "version.desc",
                "limit": "1",
            },
        )
        next_version = (existing[0]["version"] + 1) if existing else 1
        try:
            rows = await user.db.insert("flow_versions", {**payload, "version": next_version})
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 409 or "duplicate key" in (exc.response.text or ""):
                last_error = exc
                continue
            raise
        version = rows[0]
        break

    if version is None:
        log.warning("Version snapshot for flow %s kept conflicting: %s", flow_id, last_error)
        raise HTTPException(409, "Could not save: another save is in progress. Try again.")
    await user.db.update(
        "flows",
        {"current_version_id": version["id"]},
        params={"id": f"eq.{flow_id}"},
    )
    return version
