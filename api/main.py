"""FloowForge FastAPI entrypoint.

Run locally:
    uvicorn api.main:app --reload --port 5001

Run worker (separate process):
    python -m api.worker
"""
from __future__ import annotations

import asyncio
import contextlib
import logging

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import SupabaseClient, aclose_clients
from .ratelimit import events as client_events
from .ratelimit import middleware as ratelimit_middleware
from .routers.custom_nodes import router as custom_nodes_router
from .routers.flows import router as flows_router
from .routers.integrations import router as integrations_router
from .routers.media import router as media_router
from .routers.runs import flow_runs_router
from .routers.runs import router as runs_router
from .routers.triggers import public_router as triggers_public_router
from .routers.triggers import router as triggers_router
from .scheduler import FlowScheduler
from .webhooks import SIGNATURE_HEADER, TIMESTAMP_HEADER

log = logging.getLogger(__name__)


async def _check_schema() -> None:
    """Warn at boot when the database is missing columns the API depends on."""
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return
    db = SupabaseClient.as_service()
    for column in ("start_node_ids", "trigger_id"):
        try:
            await db.select("runs", params={"select": column, "limit": "1"})
        except httpx.HTTPStatusError as exc:
            body = (exc.response.text or "").strip()
            if column in body or exc.response.status_code in (400, 404):
                log.warning(
                    "Supabase schema is missing runs.%s. Apply the migrations in "
                    "supabase/migrations (latest: 0003_audit_fixes.sql). Detail: %s",
                    column,
                    body[:200],
                )
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Supabase schema probe failed: %s", exc)
            return


async def _connect_redis(settings) -> aioredis.Redis | None:
    try:
        r = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=False,
            socket_connect_timeout=10,
        )
        await r.ping()
        return r
    except Exception as exc:
        log.warning("Redis unavailable (%s); runs will execute inline", exc)
        return None


async def _redis_reconnect_loop(app: FastAPI) -> None:
    """Retry the Redis connection while it is down.

    Redis used to be probed once at startup: if it was down at boot, every run
    for the lifetime of the process — including public webhooks — executed
    inline in the API process.
    """
    settings = get_settings()
    while True:
        await asyncio.sleep(30)
        if app.state.redis is not None:
            continue
        app.state.redis = await _connect_redis(settings)
        if app.state.redis is not None:
            log.info("Reconnected to Redis; resuming queued execution")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.public_api_url = settings.PUBLIC_API_URL
    app.state.redis = await _connect_redis(settings)
    reconnect_task = asyncio.create_task(_redis_reconnect_loop(app))
    app.state.scheduler = FlowScheduler(redis=app.state.redis)
    await app.state.scheduler.start()
    await _check_schema()
    events_task = asyncio.create_task(client_events.flush_loop(app))
    try:
        yield
    finally:
        reconnect_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await reconnect_task
        events_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await events_task
        # Best-effort final drain so a clean shutdown doesn't lose the buffer.
        if settings.CLIENT_EVENTS_ENABLED and settings.SUPABASE_SERVICE_ROLE_KEY:
            with contextlib.suppress(Exception):
                await client_events.flush_once(app.state.redis)
        await app.state.scheduler.stop()
        if app.state.redis is not None:
            await app.state.redis.aclose()
        await aclose_clients()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="FloowForge API", version="0.1.0", lifespan=lifespan)

    # Registered before CORS so CORS ends up outermost: a browser must be able
    # to read the RateLimit-*/Retry-After headers on a 429.
    app.middleware("http")(ratelimit_middleware.dispatch)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            SIGNATURE_HEADER,
            TIMESTAMP_HEADER,
            "X-Client-Id",
            "X-Client-Tz",
        ],
        expose_headers=[
            "RateLimit-Limit",
            "RateLimit-Remaining",
            "RateLimit-Reset",
            "Retry-After",
        ],
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
