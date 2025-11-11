"""Trigger CRUD + the public webhook endpoint."""
from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from ..db import SupabaseClient
from ..deps import CurrentUserDep
from ..schemas import TriggerCreate, TriggerUpdate
from .runs import _enqueue_or_run_inline

router = APIRouter(prefix="/triggers", tags=["triggers"])

_INPUT_NODE_TYPES = {"textbox", "imagebox", "audiobox", "filebox", "chatbox"}
_TRIGGER_NODE_TYPES = {"webhook_in", "manual_in", "schedule_in", "button"}

_KIND_TO_NODE_TYPES: dict[str, set[str]] = {
    "incoming_webhook": {"webhook_in"},
    "webhook": {"webhook_in"},
    "schedule": {"schedule_in"},
    "public_form": {"manual_in"},
}

_WEBHOOK_KINDS = {"webhook", "incoming_webhook", "public_form"}


@router.get("")
async def list_triggers(user: CurrentUserDep, flow_id: str | None = None):
    params: dict[str, str] = {"select": "*,webhook_secrets(*)", "order": "created_at.desc"}
    if flow_id:
        params["flow_id"] = f"eq.{flow_id}"
    return await user.db.select("triggers", params=params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trigger(body: TriggerCreate, user: CurrentUserDep, request: Request):
    insert: dict[str, Any] = {
        "flow_id": body.flow_id,
        "kind": body.kind,
        "config": body.config,
        "user_id": user.id,
    }
    if body.callback_url is not None:
        insert["callback_url"] = body.callback_url
    if body.entry_node_id is not None:
        insert["entry_node_id"] = body.entry_node_id
    if body.show_outputs:
        insert["show_outputs"] = body.show_outputs
    if body.output_node_ids:
        insert["output_node_ids"] = body.output_node_ids
    rows = await user.db.insert("triggers", insert)
    trigger = rows[0]
    if body.kind in _WEBHOOK_KINDS:
        token = secrets.token_urlsafe(24)
        secret = secrets.token_urlsafe(32)
        sc = SupabaseClient.as_service()
        await sc.insert(
            "webhook_secrets",
            {"trigger_id": trigger["id"], "token": token, "secret": secret},
        )
        trigger["webhook"] = {
            "url": f"{request.app.state.public_api_url}/t/webhook/{token}",
            "token": token,
            "secret": secret,
        }
    if body.kind == "schedule":
        scheduler = request.app.state.scheduler
        if scheduler is not None:
            scheduler.add_trigger(trigger)
    return trigger


@router.patch("/{trigger_id}")
async def update_trigger(
    trigger_id: str,
    body: TriggerUpdate,
    user: CurrentUserDep,
    request: Request,
):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(400, "Empty update")
    rows = await user.db.update(
        "triggers", payload, params={"id": f"eq.{trigger_id}"}
    )
    if not rows:
        raise HTTPException(404, "Trigger not found")
    trigger = rows[0]
    scheduler = getattr(request.app.state, "scheduler", None)
    if scheduler is not None and trigger.get("kind") == "schedule":
        scheduler.remove_trigger(trigger_id)
        if trigger.get("is_active"):
            scheduler.add_trigger(trigger)
    return trigger


@router.get("/{trigger_id}/webhook-info")
async def get_webhook_info(trigger_id: str, user: CurrentUserDep, request: Request):
    """Return the webhook token/URL for a trigger that has one."""
    sc = SupabaseClient.as_service()
    rows = await sc.select(
        "webhook_secrets", params={"trigger_id": f"eq.{trigger_id}", "select": "token,secret"}
    )
    if not rows:
        raise HTTPException(404, "No webhook secret for this trigger")
    token = rows[0]["token"]
    api_url = getattr(request.app.state, "public_api_url", str(request.base_url).rstrip("/"))
    return {"token": token, "url": f"{api_url}/t/webhook/{token}"}


@router.delete("/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger(trigger_id: str, user: CurrentUserDep, request: Request):
    scheduler = getattr(request.app.state, "scheduler", None)
    if scheduler is not None:
        scheduler.remove_trigger(trigger_id)
    await user.db.delete("triggers", params={"id": f"eq.{trigger_id}"})


@router.get("/{trigger_id}/entry-nodes")
async def list_entry_nodes(trigger_id: str, user: CurrentUserDep):
    """Return all trigger-type nodes in the trigger's flow for the entry-node picker."""
    triggers = await user.db.select(
        "triggers", params={"id": f"eq.{trigger_id}", "select": "flow_id"}
    )
    if not triggers:
        raise HTTPException(404, "Trigger not found")
    flow_id = triggers[0]["flow_id"]
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "current_version_id"},
        single=True,
    )
    if not flow or not flow.get("current_version_id"):
        return []
    version = await user.db.select(
        "flow_versions",
        params={"id": f"eq.{flow['current_version_id']}", "select": "graph"},
        single=True,
    )
    if not version:
        return []
    graph = version.get("graph") or {}
    nodes = graph.get("nodes", [])
    return [
        {"id": n["id"], "type": n["type"], "name": (n.get("data") or {}).get("name", n["type"])}
        for n in nodes
        if n.get("type") in _TRIGGER_NODE_TYPES
    ]


@router.get("/flow/{flow_id}/entry-nodes")
async def list_flow_entry_nodes(
    flow_id: str, user: CurrentUserDep, kind: str | None = None
):
    """Return trigger-type nodes in a flow, optionally filtered by trigger kind."""
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "current_version_id"},
        single=True,
    )
    if not flow or not flow.get("current_version_id"):
        return []
    version = await user.db.select(
        "flow_versions",
        params={"id": f"eq.{flow['current_version_id']}", "select": "graph"},
        single=True,
    )
    if not version:
        return []
    graph = version.get("graph") or {}
    nodes = graph.get("nodes", [])
    allowed = _KIND_TO_NODE_TYPES.get(kind, _TRIGGER_NODE_TYPES) if kind else _TRIGGER_NODE_TYPES
    return [
        {"id": n["id"], "type": n["type"], "name": (n.get("data") or {}).get("name", n["type"])}
        for n in nodes
        if n.get("type") in allowed
    ]


@router.get("/flow/{flow_id}/entry-nodes/{node_id}/inputs")
async def list_entry_node_inputs(flow_id: str, node_id: str, user: CurrentUserDep):
    """Return input boxes that are direct children of the given entry node.

    Only direct children count as "inputs to the branch". Deeper descendants
    are intermediate processing nodes, not user-facing inputs.
    """
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "current_version_id"},
        single=True,
    )
    if not flow or not flow.get("current_version_id"):
        return []
    version = await user.db.select(
        "flow_versions",
        params={"id": f"eq.{flow['current_version_id']}", "select": "graph"},
        single=True,
    )
    if not version:
        return []
    graph = version.get("graph") or {}
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    child_ids = [e["target"] for e in edges if e["source"] == node_id]
    nodes_by_id = {n["id"]: n for n in nodes}
    result = []
    for cid in child_ids:
        node = nodes_by_id.get(cid)
        if not node or node.get("type") not in _INPUT_NODE_TYPES:
            continue
        data = node.get("data") or {}
        result.append({
            "id": node["id"],
            "type": node["type"],
            "name": data.get("name", node["type"]),
            "default_value": data.get("value"),
        })
    return result


@router.get("/flow/{flow_id}/sink-nodes")
async def list_flow_sink_nodes(flow_id: str, user: CurrentUserDep):
    """Return all nodes with no children (sink nodes) in the flow graph."""
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "current_version_id"},
        single=True,
    )
    if not flow or not flow.get("current_version_id"):
        return []
    version = await user.db.select(
        "flow_versions",
        params={"id": f"eq.{flow['current_version_id']}", "select": "graph"},
        single=True,
    )
    if not version:
        return []
    graph = version.get("graph") or {}
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    sources = {e["source"] for e in edges}
    return [
        {"id": n["id"], "type": n["type"], "name": (n.get("data") or {}).get("name", n["type"])}
        for n in nodes
        if n["id"] not in sources
    ]


# ---------------------------------------------------------------------------
# Public webhook router (no auth)
# ---------------------------------------------------------------------------
public_router = APIRouter(prefix="/t", tags=["public-triggers"])


def _derive_form_fields(graph: dict, entry_node_id: str | None) -> list[dict]:
    """Auto-derive input fields from the entry node's direct children."""
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not entry_node_id:
        return []
    child_ids = [e["target"] for e in edges if e["source"] == entry_node_id]
    nodes_by_id = {n["id"]: n for n in nodes}
    fields = []
    for cid in child_ids:
        n = nodes_by_id.get(cid)
        if not n or n.get("type") not in _INPUT_NODE_TYPES:
            continue
        data = n.get("data") or {}
        fields.append({
            "node_id": n["id"],
            "type": n["type"],
            "name": data.get("name", n["type"]),
            "default_value": data.get("value"),
        })
    return fields


def _derive_header_text(graph: dict) -> str | None:
    """Return the text of the first header node in the graph, if any."""
    for n in graph.get("nodes", []):
        if n.get("type") == "header":
            return (n.get("data") or {}).get("text")
    return None


@public_router.get("/webhook/{token}/info")
async def webhook_info(token: str):
    sc = SupabaseClient.as_service()
    secrets_row = await sc.select(
        "webhook_secrets",
        params={"token": f"eq.{token}", "select": "*,triggers(*)"},
        single=True,
    )
    trigger = secrets_row.get("triggers") if isinstance(secrets_row, dict) else None
    if not trigger or not trigger.get("is_active"):
        raise HTTPException(404, "Trigger not found")
    flow_row = await sc.select(
        "flows",
        params={"id": f"eq.{trigger['flow_id']}", "select": "id,name,current_version_id"},
        single=True,
    )
    if not flow_row.get("current_version_id"):
        raise HTTPException(409, "Flow has no current version")
    version = await sc.select(
        "flow_versions",
        params={
            "id": f"eq.{flow_row['current_version_id']}",
            "select": "id,inputs,outputs,graph",
        },
        single=True,
    )
    graph = (version or {}).get("graph") or {}
    inputs = (version or {}).get("inputs") or []
    if not inputs:
        inputs = _derive_form_fields(graph, trigger.get("entry_node_id"))

    config = trigger.get("config") or {}
    input_modes: dict[str, str] = config.get("input_modes") or {}

    # Filter inputs based on input_modes: only include fields where mode is
    # "dynamic" (user should fill them in). "default" fields use the saved
    # workflow value and shouldn't be rendered as form inputs.
    if input_modes:
        filtered: list[dict] = []
        for field in inputs:
            field_id = field.get("node_id") or field.get("id") or ""
            mode = input_modes.get(field_id, "default")
            if mode == "dynamic":
                filtered.append(field)
        inputs = filtered

    header_text = _derive_header_text(graph)
    return {
        "flow_id": flow_row["id"],
        "flow_name": flow_row.get("name"),
        "header_text": header_text,
        "show_outputs": trigger.get("show_outputs", False),
        "inputs": inputs,
        "outputs": (version or {}).get("outputs") or [],
    }


@public_router.post("/webhook/{token}")
async def webhook_run(token: str, request: Request, background: BackgroundTasks):
    sc = SupabaseClient.as_service()
    secrets_row = await sc.select(
        "webhook_secrets",
        params={"token": f"eq.{token}", "select": "*,triggers(*)"},
        single=True,
    )
    trigger = secrets_row.get("triggers") if isinstance(secrets_row, dict) else None
    if not trigger or not trigger.get("is_active"):
        raise HTTPException(404, "Trigger not found")

    flow_rows = await sc.select(
        "flows",
        params={"id": f"eq.{trigger['flow_id']}", "select": "*"},
        single=True,
    )
    if not flow_rows.get("current_version_id"):
        raise HTTPException(409, "Flow has no current version")

    payload = None
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            payload = await request.json()
        except Exception:
            payload = None
    if payload is None:
        payload = (await request.body()).decode(errors="ignore")

    start_node_ids = None
    entry_node_id = trigger.get("entry_node_id")
    if entry_node_id:
        start_node_ids = [entry_node_id]

    _TRIGGER_KIND_TO_RUN_KIND: dict[str, str] = {
        "incoming_webhook": "webhook_in",
        "webhook": "webhook_in",
        "public_form": "public_in",
    }
    run_trigger_kind = _TRIGGER_KIND_TO_RUN_KIND.get(
        trigger.get("kind", "webhook"), trigger.get("kind", "webhook")
    )

    insert_body: dict[str, Any] = {
        "flow_id": trigger["flow_id"],
        "flow_version_id": flow_rows["current_version_id"],
        "user_id": trigger["user_id"],
        "status": "queued",
        "trigger_kind": run_trigger_kind,
        "input": payload,
    }
    if start_node_ids:
        insert_body["start_node_ids"] = start_node_ids

    runs = await sc.insert("runs", insert_body)
    run = runs[0]
    await _enqueue_or_run_inline(
        request,
        background,
        run_id=run["id"],
        start_node_ids=start_node_ids,
    )
    return {"run_id": run["id"], "show_outputs": trigger.get("show_outputs", False)}


@public_router.get("/webhook/{token}/runs/{run_id}")
async def webhook_run_status(token: str, run_id: str):
    sc = SupabaseClient.as_service()
    secrets_row = await sc.select(
        "webhook_secrets",
        params={"token": f"eq.{token}", "select": "*,triggers(*)"},
        single=True,
    )
    trigger = secrets_row.get("triggers") if isinstance(secrets_row, dict) else None
    if not trigger:
        raise HTTPException(404, "Trigger not found")
    run = await sc.select(
        "runs",
        params={"id": f"eq.{run_id}", "flow_id": f"eq.{trigger['flow_id']}", "select": "id,status,output,ended_at,error"},
        single=True,
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@public_router.get("/webhook/{token}/result/{run_id}")
async def webhook_run_result(token: str, run_id: str):
    """Result endpoint that respects show_outputs."""
    sc = SupabaseClient.as_service()
    secrets_row = await sc.select(
        "webhook_secrets",
        params={"token": f"eq.{token}", "select": "*,triggers(*)"},
        single=True,
    )
    trigger = secrets_row.get("triggers") if isinstance(secrets_row, dict) else None
    if not trigger:
        raise HTTPException(404, "Trigger not found")
    if not trigger.get("show_outputs"):
        return {"status": "results_disabled"}
    run = await sc.select(
        "runs",
        params={
            "id": f"eq.{run_id}",
            "flow_id": f"eq.{trigger['flow_id']}",
            "select": "id,status,output,ended_at,error",
        },
        single=True,
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return run
