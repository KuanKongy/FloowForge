"""Trigger CRUD + the public webhook endpoint."""
from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ..db import SupabaseClient
from ..deps import CurrentUserDep
from ..scheduler import validate_schedule_config
from ..schemas import TriggerCreate, TriggerUpdate
from ..utils.rate_limit import public_rate_limit
from ..webhooks import SIGNATURE_HEADER, TIMESTAMP_HEADER, verify_webhook_signature
from .runs import _enqueue_or_run_inline

router = APIRouter(prefix="/triggers", tags=["triggers"])

# Public webhook bodies land in `runs.input` (jsonb). Cap them so an anonymous
# caller cannot buffer an arbitrarily large request in the API process.
MAX_WEBHOOK_BODY_BYTES = 1 * 1024 * 1024

_PUBLIC_RUN_LIMIT = public_rate_limit(max_calls=20, window_s=60)
_PUBLIC_READ_LIMIT = public_rate_limit(max_calls=120, window_s=60)


async def _read_capped_body(request: Request) -> bytes:
    """Read the request body, rejecting anything over the cap.

    Checks ``Content-Length`` first, then streams so a lying or absent header
    cannot be used to slip a huge body through.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_WEBHOOK_BODY_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Payload exceeds {MAX_WEBHOOK_BODY_BYTES} bytes",
        )
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Payload exceeds {MAX_WEBHOOK_BODY_BYTES} bytes",
            )
        chunks.append(chunk)
    return b"".join(chunks)

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


async def _assert_flow_owned(flow_id: str, user: CurrentUserDep) -> dict[str, Any]:
    """Confirm the caller owns ``flow_id``.

    RLS on ``triggers`` only checks ``user_id``, which the handler sets itself, so
    without this a trigger could be attached to another tenant's flow and then
    fired through the service-role public webhook path.
    """
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "user_id": f"eq.{user.id}", "select": "*"},
        single=True,
    )
    if not flow:
        raise HTTPException(404, "Flow not found")
    return flow


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trigger(body: TriggerCreate, user: CurrentUserDep, request: Request):
    await _assert_flow_owned(body.flow_id, user)
    if body.kind == "schedule":
        # Validate the schedule before inserting so a bad cron can't leave an
        # orphaned trigger row behind (the scheduler used to raise after insert).
        try:
            validate_schedule_config(body.config or {})
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
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
    """Return the webhook token/URL for a trigger that has one.

    Reads through ``user.db`` so RLS scopes the lookup to the caller. Using the
    service role here (as this used to) let any authenticated user fetch any
    trigger's token and fire someone else's flow.
    """
    owned = await user.db.select(
        "triggers",
        params={"id": f"eq.{trigger_id}", "user_id": f"eq.{user.id}", "select": "id"},
    )
    if not owned:
        raise HTTPException(404, "Trigger not found")
    rows = await user.db.select(
        "webhook_secrets", params={"trigger_id": f"eq.{trigger_id}", "select": "token"}
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


@public_router.get("/webhook/{token}/info", dependencies=[Depends(_PUBLIC_READ_LIMIT)])
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
    # Only forms are meant to publish their input schema. A machine-to-machine
    # webhook token should not disclose the flow's name and field defaults.
    if trigger.get("kind") != "public_form":
        raise HTTPException(404, "Trigger not found")
    flow_row = await sc.select(
        "flows",
        params={"id": f"eq.{trigger['flow_id']}", "select": "id,name,current_version_id"},
        single=True,
    )
    if not flow_row or not flow_row.get("current_version_id"):
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


@public_router.post("/webhook/{token}", dependencies=[Depends(_PUBLIC_RUN_LIMIT)])
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
    if not flow_rows or not flow_rows.get("current_version_id"):
        raise HTTPException(409, "Flow has no current version")

    raw_body = await _read_capped_body(request)

    # Public forms are opened in a browser and cannot hold a shared secret, so
    # signatures are enforced for machine-to-machine webhook kinds only.
    if trigger.get("kind") in {"webhook", "incoming_webhook"}:
        ok, reason = verify_webhook_signature(
            (secrets_row or {}).get("secret"),
            raw_body,
            request.headers.get(SIGNATURE_HEADER),
            request.headers.get(TIMESTAMP_HEADER),
        )
        if not ok:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, reason)

    payload = None
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            payload = json.loads(raw_body) if raw_body else None
        except ValueError:
            payload = None
    if payload is None:
        payload = raw_body.decode(errors="ignore")

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
        # Stamped so the public status/result endpoints can scope reads to runs
        # this token actually created, instead of every run of the flow.
        "trigger_id": trigger["id"],
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


async def _load_public_run(token: str, run_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Resolve a token to its trigger and fetch a run that trigger created.

    Scoping on ``trigger_id`` rather than ``flow_id`` matters: a public form link
    must not expose the owner's private editor runs on the same flow.
    """
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
        params={
            "id": f"eq.{run_id}",
            "trigger_id": f"eq.{trigger['id']}",
            "select": "id,status,output,ended_at,error",
        },
        single=True,
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return trigger, run


def _public_run_view(trigger: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    """Strip anything the link holder is not entitled to see.

    ``error`` is never returned: it carries raw provider and PostgREST response
    bodies. Outputs appear only when the owner enabled ``show_outputs``.
    """
    view: dict[str, Any] = {
        "id": run.get("id"),
        "status": run.get("status"),
        "ended_at": run.get("ended_at"),
    }
    if run.get("error"):
        view["error"] = "Run failed"
    if trigger.get("show_outputs"):
        view["output"] = run.get("output")
    return view


@public_router.get("/webhook/{token}/runs/{run_id}", dependencies=[Depends(_PUBLIC_READ_LIMIT)])
async def webhook_run_status(token: str, run_id: str):
    trigger, run = await _load_public_run(token, run_id)
    return _public_run_view(trigger, run)


@public_router.get("/webhook/{token}/result/{run_id}", dependencies=[Depends(_PUBLIC_READ_LIMIT)])
async def webhook_run_result(token: str, run_id: str):
    """Result endpoint that respects show_outputs."""
    trigger, run = await _load_public_run(token, run_id)
    if not trigger.get("show_outputs"):
        return {"status": "results_disabled"}
    return _public_run_view(trigger, run)
