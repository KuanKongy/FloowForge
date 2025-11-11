"""FlowForge FastAPI entrypoint.

Run locally:
    uvicorn main:app --reload --port 5001

Run worker (separate process):
    arq worker.WorkerSettings
"""
from __future__ import annotations

import contextlib
import logging

import httpx
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import SupabaseClient
from .routers.custom_nodes import router as custom_nodes_router
from .routers.flows import router as flows_router
from .routers.integrations import router as integrations_router
from .routers.media import router as media_router
from .routers.runs import flow_runs_router, router as runs_router
from .routers.triggers import public_router as triggers_public_router, router as triggers_router
from .scheduler import FlowScheduler

log = logging.getLogger(__name__)


async def _check_schema() -> None:
    """Probe the Supabase schema for migration 0004 columns and warn loudly if
    they're missing. The probe asks for ``start_node_ids`` on ``runs``; if the
    column doesn't exist Supabase returns 400, which is the exact failure mode
    that breaks ``POST /flows/:id/runs``. Surfacing the warning at boot makes
    misconfigured projects obvious from the API logs.
    """
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    db = SupabaseClient.as_service()
    try:
        await db.select("runs", params={"select": "start_node_ids", "limit": "1"})
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "").strip()
        if "start_node_ids" in body or exc.response.status_code in (400, 404):
            log.warning(
                "Supabase schema appears to be missing migration "
                "0004_run_scope.sql (runs.start_node_ids). Apply it from "
                "supabase/migrations/0004_run_scope.sql or runs will return "
                "400. Detail: %s",
                body[:200],
            )
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("Supabase schema probe failed: %s", exc)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.public_api_url = settings.PUBLIC_API_URL
    try:
        app.state.arq = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    except Exception:
        # Boot the API even if Redis is down; runs will queue once it returns.
        app.state.arq = None
    app.state.scheduler = FlowScheduler(arq=app.state.arq)
    await app.state.scheduler.start()
    await _check_schema()
    try:
        yield
    finally:
        await app.state.scheduler.stop()
        if app.state.arq is not None:
            await app.state.arq.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="FlowForge API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.WEB_ORIGIN, "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(flows_router)
    app.include_router(flow_runs_router)
    app.include_router(runs_router)
    app.include_router(triggers_router)
    app.include_router(triggers_public_router)
    app.include_router(custom_nodes_router)
    app.include_router(integrations_router)
    app.include_router(media_router)

    @app.get("/health")
    async def health():
        return {"ok": True}

    return app


app = create_app()
