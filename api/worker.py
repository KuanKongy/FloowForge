"""Arq worker. Run with: `arq api.worker.WorkerSettings`.

Picks up `run_flow` jobs enqueued by routers/runs.py and triggers/scheduler.
"""
from __future__ import annotations

from arq.connections import RedisSettings

from .config import get_settings
from .engine.executor import run_flow as engine_run_flow


async def run_flow(ctx, run_id: str, start_node_ids: list[str] | None = None):
    return await engine_run_flow(run_id, start_node_ids)


async def startup(ctx):
    pass


async def shutdown(ctx):
    pass


class WorkerSettings:
    functions = [run_flow]
    on_startup = startup
    on_shutdown = shutdown
    # arq reads this as a class attribute at boot.
    redis_settings = RedisSettings.from_dsn(get_settings().REDIS_URL)
