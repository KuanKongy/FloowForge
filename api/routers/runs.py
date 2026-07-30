"""Run lifecycle: enqueue, list, get, cancel.

Runs are executed by the Redis Streams worker. When Redis is unavailable
(``app.state.redis is None``), we fall back to executing the run as an asyncio
task in the API process so the platform stays usable for dev, tests, and small
deployments.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ..db import realtime_broadcast
from ..deps import CurrentUser, CurrentUserDep
from ..schemas import RunCreate
from ..utils.rate_limit import rate_limit

log = logging.getLogger(__name__)

router = APIRouter(prefix="/runs", tags=["runs"])


# Inline execution runs inside the API process, so it needs its own ceiling —
# otherwise a burst of public webhook calls spawns unbounded background tasks.
_INLINE_LIMIT = asyncio.Semaphore(4)


async def _mark_run_failed(run_id: str, message: str) -> None:
    """Leave a terminal state behind instead of a run stuck in `queued`."""
    try:
        from ..db import SupabaseClient

        sc = SupabaseClient.as_service()
        await sc.update(
            "runs",
            {
                "status": "failed",
                "ended_at": datetime.now(UTC).isoformat(),
                "error": message,
            },
            params={"id": f"eq.{run_id}", "status": "in.(queued,running)"},
            returning=False,
        )
    except Exception:
        log.exception("Could not mark run %s as failed", run_id)


async def _enqueue_or_run_inline(
    request: Request,
    background: BackgroundTasks,
    *,
    run_id: str,
    start_node_ids: list[str] | None,
) -> str:
    """Push the run onto the Redis Streams job queue. Falls back to inline
    execution when Redis is unavailable.
    """
    from ..queue import enqueue as stream_enqueue

    r = getattr(request.app.state, "redis", None)
    if r is not None:
        try:
            await stream_enqueue(r, run_id, start_node_ids or None)
            return "queued"
        except Exception as exc:
            # Redis died after the run row was written. Fall back to inline
            # rather than stranding the run in `queued` forever.
            log.warning("Enqueue failed for run %s, running inline: %s", run_id, exc)

    async def _inline() -> None:
        from ..engine.executor import run_flow

        try:
            async with _INLINE_LIMIT:
                await run_flow(run_id, start_node_ids or None)
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("Inline run_flow %s failed: %s", run_id, exc)
            await _mark_run_failed(run_id, f"Run failed to start: {exc}")

    background.add_task(_inline)
    return "inline"


@router.get("")
async def list_runs(user: CurrentUserDep, flow_id: str | None = None):
    params: dict[str, str] = {"user_id": f"eq.{user.id}", "select": "*", "order": "created_at.desc", "limit": "100"}
    if flow_id:
        params["flow_id"] = f"eq.{flow_id}"
    return await user.db.select("runs", params=params)


@router.get("/{run_id}")
async def get_run(run_id: str, user: CurrentUserDep):
    run = await user.db.select(
        "runs",
        params={"id": f"eq.{run_id}", "user_id": f"eq.{user.id}", "select": "*"},
        single=True,
    )
    if not run:
        raise HTTPException(404, "Run not found")
    events = await user.db.select(
        "run_events",
        params={"run_id": f"eq.{run_id}", "select": "*", "order": "ts.asc"},
    )
    return {"run": run, "events": events}


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: str, user: CurrentUserDep):
    run = await user.db.select(
        "runs",
        params={"id": f"eq.{run_id}", "user_id": f"eq.{user.id}", "select": "id"},
        single=True,
    )
    if not run:
        raise HTTPException(404, "Run not found")
    # `run_events` has SELECT-only RLS, so a user-scoped delete here silently
    # affects zero rows. The FK from run_events.run_id cascades instead.
    await user.db.delete("runs", params={"id": f"eq.{run_id}", "user_id": f"eq.{user.id}"})


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str, user: CurrentUserDep):
    rows = await user.db.update(
        "runs",
        {"status": "cancelled"},
        params={"id": f"eq.{run_id}", "status": "in.(queued,running)"},
    )
    if not rows:
        raise HTTPException(404, "Run not found or not cancellable")
    # Broadcast a cancel signal so the editor / sidebar can react immediately
    # (the executor watchdog also picks this up via DB polling).
    await realtime_broadcast(
        f"run:{run_id}",
        "run_cancelled",
        {"run_id": run_id, "kind": "run_cancelled", "payload": {}},
    )
    return rows[0]


# A flow-scoped enqueue endpoint, mounted from main.py.
flow_runs_router = APIRouter(prefix="/flows", tags=["runs"])


@flow_runs_router.post("/{flow_id}/runs", status_code=status.HTTP_201_CREATED)
async def enqueue_run(
    flow_id: str,
    body: RunCreate,
    request: Request,
    background: BackgroundTasks,
    user: CurrentUser = Depends(rate_limit(max_calls=30, window_s=60)),
) -> dict[str, Any]:
    flow = await user.db.select(
        "flows",
        params={"id": f"eq.{flow_id}", "user_id": f"eq.{user.id}", "select": "*"},
        single=True,
    )
    if not flow:
        raise HTTPException(404, "Flow not found")
    version_id = body.version_id or flow.get("current_version_id")
    if not version_id:
        raise HTTPException(400, "Flow has no current version")
    if body.version_id and body.version_id != flow.get("current_version_id"):
        # An explicit version_id used to be trusted verbatim, so passing another
        # tenant's flow_version_id executed their graph under this user's run.
        owned_version = await user.db.select(
            "flow_versions",
            params={
                "id": f"eq.{body.version_id}",
                "flow_id": f"eq.{flow_id}",
                "select": "id",
            },
        )
        if not owned_version:
            raise HTTPException(404, "Flow version not found")

    trigger_kind = "manual" if body.start_node_ids else "whole"
    insert_body: dict[str, Any] = {
        "flow_id": flow_id,
        "flow_version_id": version_id,
        "user_id": user.id,
        "status": "queued",
        "trigger_kind": trigger_kind,
        "input": body.input,
    }
    if body.start_node_ids:
        insert_body["start_node_ids"] = body.start_node_ids
    # Resume context (per-ancestor-output snapshot) is stored alongside the
    # run input so the executor can pull it back. We piggyback on the
    # existing ``input`` jsonb column to avoid a schema change: input becomes
    # ``{"value": user_input, "input_overrides": {...}}`` whenever overrides
    # are present, and the executor unwraps it.
    if body.input_overrides:
        insert_body["input"] = {
            "value": body.input,
            "input_overrides": body.input_overrides,
        }
    try:
        rows = await user.db.insert("runs", insert_body)
    except httpx.HTTPStatusError as exc:
        # Keep the PostgREST body in the server log only — it names columns and
        # constraints. Clients get a hint for the one case they can act on.
        body_text = (exc.response.text or "").strip()
        log.warning("enqueue_run insert runs failed: %s", body_text)
        detail = "Could not create run."
        if "start_node_ids" in body_text or "parent_run_id" in body_text:
            detail += (
                " The runs table is missing columns — apply the latest migrations"
                " in supabase/migrations to your Supabase project."
            )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail) from exc
    run = rows[0]
    await _enqueue_or_run_inline(
        request,
        background,
        run_id=run["id"],
        start_node_ids=body.start_node_ids,
    )
    return run
