"""Trigger CRUD + the public webhook endpoint."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from ..db import SupabaseClient
from ..deps import CurrentUserDep
from ..schemas import TriggerCreate, TriggerUpdate
from .runs import _enqueue_or_run_inline

router = APIRouter(prefix="/triggers", tags=["triggers"])


@router.get("")
async def list_triggers(user: CurrentUserDep, flow_id: str | None = None):
    params: dict[str, str] = {"select": "*,webhook_secrets(*)", "order": "created_at.desc"}
    if flow_id:
        params["flow_id"] = f"eq.{flow_id}"
    return await user.db.select("triggers", params=params)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trigger(body: TriggerCreate, user: CurrentUserDep, request: Request):
    rows = await user.db.insert(
        "triggers",
        {**body.model_dump(), "user_id": user.id},
    )
    trigger = rows[0]
    if body.kind == "webhook":
        token = secrets.token_urlsafe(24)
        secret = secrets.token_urlsafe(32)
        # Use the service role to write into webhook_secrets so we don't need a
        # separate RLS policy for INSERT (only owner-read is exposed).
        sc = SupabaseClient.as_service()
        await sc.insert(
            "webhook_secrets",
            {"trigger_id": trigger["id"], "token": token, "secret": secret},
        )
        trigger["webhook"] = {
            "url": f"{request.app.state.public_api_url}/t/webhook/{token}",
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
    # Re-sync the schedule with the in-process scheduler so cron edits and
    # is_active toggles take effect immediately.
    scheduler = getattr(request.app.state, "scheduler", None)
    if scheduler is not None and trigger.get("kind") == "schedule":
        scheduler.remove_trigger(trigger_id)
        if trigger.get("is_active"):
            scheduler.add_trigger(trigger)
    return trigger


@router.delete("/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger(trigger_id: str, user: CurrentUserDep, request: Request):
    scheduler = getattr(request.app.state, "scheduler", None)
    if scheduler is not None:
        scheduler.remove_trigger(trigger_id)
    await user.db.delete("triggers", params={"id": f"eq.{trigger_id}"})


# ---------------------------------------------------------------------------
# Public webhook router (no auth)
# ---------------------------------------------------------------------------
public_router = APIRouter(prefix="/t", tags=["public-triggers"])


@public_router.get("/webhook/{token}/info")
async def webhook_info(token: str):
    """Public endpoint that exposes a webhook trigger's flow name + version
    inputs (without leaking the user's token or other triggers). Used by the
    /p/[token] public form to render the right inputs and submit them.

    Returns 404 for unknown / paused tokens — the form page treats that as
    "this link is not active" and shows a friendly error.
    """
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
            "select": "id,inputs,outputs",
        },
        single=True,
    )
    return {
        "flow_id": flow_row["id"],
        "flow_name": flow_row.get("name"),
        "inputs": (version or {}).get("inputs") or [],
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

    runs = await sc.insert(
        "runs",
        {
            "flow_id": trigger["flow_id"],
            "flow_version_id": flow_rows["current_version_id"],
            "user_id": trigger["user_id"],
            "status": "queued",
            "trigger_kind": "webhook",
            "input": payload,
        },
    )
    run = runs[0]
    await _enqueue_or_run_inline(
        request,
        background,
        run_id=run["id"],
        start_node_ids=None,
    )
    return {"run_id": run["id"]}
