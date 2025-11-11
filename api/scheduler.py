"""APScheduler-driven cron triggers.

On startup we load all `triggers where kind='schedule' and is_active`. When a
new schedule is created via the API, `add_trigger` is called from the router.
"""
from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .db import SupabaseClient


log = logging.getLogger(__name__)


class FlowScheduler:
    def __init__(self, *, redis):
        self._scheduler = AsyncIOScheduler()
        self._redis = redis
        self._jobs: dict[str, str] = {}  # trigger_id -> aps job id

    async def start(self) -> None:
        self._scheduler.start()
        sc = SupabaseClient.as_service()
        try:
            triggers = await sc.select(
                "triggers",
                params={"kind": "eq.schedule", "is_active": "eq.true", "select": "*"},
            )
        except Exception as e:
            log.warning("FlowScheduler could not load triggers: %s", e)
            return
        for trigger in triggers:
            try:
                self.add_trigger(trigger)
            except Exception as e:
                log.warning("Skipping malformed schedule trigger %s: %s", trigger.get("id"), e)

    async def stop(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def add_trigger(self, trigger: dict[str, Any]) -> None:
        if trigger.get("kind") != "schedule" or not trigger.get("is_active"):
            return
        config = trigger.get("config") or {}
        cron = config.get("cron")
        timezone = config.get("timezone") or "UTC"
        if not cron:
            return
        job = self._scheduler.add_job(
            _enqueue_run,
            CronTrigger.from_crontab(cron, timezone=timezone),
            args=[self._redis, trigger["id"]],
            id=f"trigger:{trigger['id']}",
            replace_existing=True,
            misfire_grace_time=60,
        )
        self._jobs[trigger["id"]] = job.id

    def remove_trigger(self, trigger_id: str) -> None:
        job_id = self._jobs.pop(trigger_id, None) or f"trigger:{trigger_id}"
        try:
            self._scheduler.remove_job(job_id)
        except Exception:
            pass


async def _enqueue_run(redis_conn, trigger_id: str) -> None:
    sc = SupabaseClient.as_service()
    trigger = await sc.select(
        "triggers",
        params={"id": f"eq.{trigger_id}", "select": "*"},
        single=True,
    )
    if not trigger.get("is_active"):
        return
    flow = await sc.select(
        "flows",
        params={"id": f"eq.{trigger['flow_id']}", "select": "*"},
        single=True,
    )
    if not flow.get("current_version_id"):
        return
    runs = await sc.insert(
        "runs",
        {
            "flow_id": trigger["flow_id"],
            "flow_version_id": flow["current_version_id"],
            "user_id": trigger["user_id"],
            "status": "queued",
            "trigger_kind": "schedule",
            "input": trigger.get("config", {}).get("input"),
        },
    )
    run_id = runs[0]["id"]
    if redis_conn is not None:
        from .queue import enqueue
        await enqueue(redis_conn, run_id, None)
    else:
        from .engine.executor import run_flow

        try:
            await run_flow(run_id, None)
        except Exception as e:
            log.warning("Scheduled inline run %s failed: %s", run_id, e)
