"""APScheduler-driven cron triggers.

On startup we load all `triggers where kind='schedule' and is_active`. When a
new schedule is created via the API, `add_trigger` is called from the router.

Supports multiple schedule modes:
- cron / daily: standard CronTrigger
- delay: DateTrigger (now + X hours)
- once: DateTrigger at a fixed datetime
- interval: IntervalTrigger every X h/m/s

One-shot triggers (delay, once) deactivate themselves after firing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .db import SupabaseClient


log = logging.getLogger(__name__)


def _parse_tz(name: str):
    """Return a timezone object. Falls back to UTC for unrecognised names."""
    if not name or name == "UTC":
        return timezone.utc
    try:
        import zoneinfo
        return zoneinfo.ZoneInfo(name)
    except Exception:
        return timezone.utc


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
        mode = config.get("schedule_mode", "cron")
        tz = _parse_tz(config.get("timezone"))
        aps_trigger = self._build_aps_trigger(mode, config, tz)
        if aps_trigger is None:
            log.warning("Cannot build APS trigger for schedule mode %r (trigger %s)", mode, trigger.get("id"))
            return
        is_oneshot = mode in ("delay", "once")
        job = self._scheduler.add_job(
            _enqueue_run,
            aps_trigger,
            args=[self._redis, trigger["id"], is_oneshot],
            id=f"trigger:{trigger['id']}",
            replace_existing=True,
            misfire_grace_time=60,
        )
        self._jobs[trigger["id"]] = job.id

    @staticmethod
    def _build_aps_trigger(mode: str, config: dict, tz) -> CronTrigger | DateTrigger | IntervalTrigger | None:
        if mode in ("cron", "daily"):
            cron = config.get("cron")
            if not cron:
                return None
            return CronTrigger.from_crontab(cron, timezone=tz)
        if mode == "delay":
            hours = float(config.get("delay_hours", 0))
            minutes = float(config.get("delay_minutes", 0))
            seconds = float(config.get("delay_seconds", 0))
            total_seconds = hours * 3600 + minutes * 60 + seconds
            if total_seconds <= 0:
                total_seconds = 3600  # default 1 hour
            run_date = datetime.now(tz) + timedelta(seconds=total_seconds)
            return DateTrigger(run_date=run_date, timezone=tz)
        if mode == "once":
            once_at = config.get("once_at")
            if not once_at:
                return None
            run_date = datetime.fromisoformat(once_at).replace(tzinfo=tz)
            return DateTrigger(run_date=run_date, timezone=tz)
        if mode == "interval":
            hours = int(config.get("interval_hours", 0))
            minutes = int(config.get("interval_minutes", 0))
            seconds = int(config.get("interval_seconds", 0))
            total = hours * 3600 + minutes * 60 + seconds
            if total <= 0:
                return None
            return IntervalTrigger(hours=hours, minutes=minutes, seconds=seconds, timezone=tz)
        # Fallback: try treating it as cron
        cron = config.get("cron")
        if cron:
            return CronTrigger.from_crontab(cron, timezone=tz)
        return None

    def remove_trigger(self, trigger_id: str) -> None:
        job_id = self._jobs.pop(trigger_id, None) or f"trigger:{trigger_id}"
        try:
            self._scheduler.remove_job(job_id)
        except Exception:
            pass


async def _enqueue_run(redis_conn, trigger_id: str, is_oneshot: bool = False) -> None:
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
    entry_node_id = trigger.get("entry_node_id")
    start_node_ids = [entry_node_id] if entry_node_id else None

    insert_body: dict[str, Any] = {
        "flow_id": trigger["flow_id"],
        "flow_version_id": flow["current_version_id"],
        "user_id": trigger["user_id"],
        "status": "queued",
        "trigger_kind": "schedule_in",
        "input": trigger.get("config", {}).get("input"),
    }
    if start_node_ids:
        insert_body["start_node_ids"] = start_node_ids

    runs = await sc.insert("runs", insert_body)
    run_id = runs[0]["id"]
    if redis_conn is not None:
        from .queue import enqueue
        await enqueue(redis_conn, run_id, start_node_ids)
    else:
        from .engine.executor import run_flow

        try:
            await run_flow(run_id, start_node_ids)
        except Exception as e:
            log.warning("Scheduled inline run %s failed: %s", run_id, e)

    if is_oneshot:
        try:
            await sc.update(
                "triggers",
                {"is_active": False},
                params={"id": f"eq.{trigger_id}"},
                returning=False,
            )
            log.info("One-shot trigger %s deactivated after firing", trigger_id)
        except Exception as e:
            log.warning("Failed to deactivate one-shot trigger %s: %s", trigger_id, e)
