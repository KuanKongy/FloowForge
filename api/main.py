"""FloowForge FastAPI entrypoint.

Run locally:
    uvicorn api.main:app --reload --port 5001

Run worker (separate process):
    python -m api.worker
"""
from __future__ import annotations

import contextlib
import logging

import httpx
import redis.asyncio as aioredis
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
    they're missing.
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
        r = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=False,
            socket_connect_timeout=10,
        )
        await r.ping()
        app.state.redis = r
    except Exception:
        app.state.redis = None
    app.state.scheduler = FlowScheduler(redis=app.state.redis)
    await app.state.scheduler.start()
    await _check_schema()
    try:
        yield
    finally:
        await app.state.scheduler.stop()
        if app.state.redis is not None:
            await app.state.redis.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="FloowForge API", version="0.1.0", lifespan=lifespan)

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
