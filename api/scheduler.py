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

import asyncio
import logging
import os
import socket
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .db import SupabaseClient

log = logging.getLogger(__name__)


# Guard against a user scheduling a flow every second and self-DoSing the queue.
MIN_INTERVAL_SECONDS = 60


def _parse_tz(name: str):
    """Return a timezone object. Falls back to UTC for unrecognised names."""
    if not name or name == "UTC":
        return UTC
    try:
        import zoneinfo
        return zoneinfo.ZoneInfo(name)
    except Exception:
        return UTC


def _parse_once_at(once_at: str, tz):
    """Parse an ISO datetime, honouring an explicit offset when one is present.

    ``.replace(tzinfo=tz)`` would silently discard the offset in values like
    ``2026-01-01T00:00:00Z`` or ``...+05:00`` and fire at the wrong instant, so
    only naive strings get the configured timezone attached.
    """
    parsed = datetime.fromisoformat(once_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz)
    return parsed


def validate_schedule_config(config: dict[str, Any]) -> None:
    """Raise ``ValueError`` if a schedule config cannot produce a valid trigger.

    Called before the trigger row is inserted so a malformed cron cannot leave an
    orphaned row behind.
    """
    mode = (config or {}).get("schedule_mode", "cron")
    tz = _parse_tz((config or {}).get("timezone"))
    if mode == "interval":
        total = (
            int(config.get("interval_hours", 0) or 0) * 3600
            + int(config.get("interval_minutes", 0) or 0) * 60
            + int(config.get("interval_seconds", 0) or 0)
        )
        if total <= 0:
            raise ValueError("Interval schedule needs a non-zero interval")
        if total < MIN_INTERVAL_SECONDS:
            raise ValueError(
                f"Interval must be at least {MIN_INTERVAL_SECONDS} seconds"
            )
        return
    try:
        built = FlowScheduler._build_aps_trigger(mode, config or {}, tz)
    except ValueError as exc:
        raise ValueError(f"Invalid schedule: {exc}") from exc
    if built is None:
        raise ValueError(f"Incomplete configuration for schedule mode {mode!r}")


# Only one API replica may own the schedule, otherwise every replica fires the
# same cron and the flow runs N times.
LEADER_KEY = "flowforge:scheduler:leader"
LEADER_TTL_S = 60
LEADER_RENEW_S = 20
# Full resync interval. `add_trigger` from a request only reaches the replica
# that served it, so the leader re-reads the table periodically.
RESYNC_INTERVAL_S = 60


class FlowScheduler:
    def __init__(self, *, redis):
        self._scheduler = AsyncIOScheduler()
        self._redis = redis
        self._jobs: dict[str, str] = {}  # trigger_id -> aps job id
        self._is_leader = False
        self._leader_id = f"{socket.gethostname()}-{os.getpid()}"
        self._maintenance: asyncio.Task | None = None

    @property
    def is_leader(self) -> bool:
        return self._is_leader

    async def _acquire_leadership(self) -> bool:
        """Claim (or renew) the scheduler lease.

        With no Redis there is only one process by definition, so it leads.
        """
        if self._redis is None:
            return True
        try:
            if self._is_leader:
                # Renew only if we still hold it.
                current = await self._redis.get(LEADER_KEY)
                if current and current.decode() == self._leader_id:
                    await self._redis.expire(LEADER_KEY, LEADER_TTL_S)
                    return True
                self._is_leader = False
            acquired = await self._redis.set(
                LEADER_KEY, self._leader_id, nx=True, ex=LEADER_TTL_S
            )
            return bool(acquired)
        except Exception as exc:
            log.warning("Scheduler leadership check failed: %s", exc)
            return False

    async def start(self) -> None:
        self._scheduler.start()
        self._is_leader = await self._acquire_leadership()
        if self._is_leader:
            log.info("Scheduler leader: %s", self._leader_id)
            await self.sync_triggers()
        else:
            log.info("Scheduler standby: another replica holds the lease")
        self._maintenance = asyncio.create_task(self._maintain())

    async def _maintain(self) -> None:
        """Renew the lease, take over if it lapses, and resync the trigger set."""
        last_resync = 0.0
        while True:
            try:
                await asyncio.sleep(LEADER_RENEW_S)
                was_leader = self._is_leader
                self._is_leader = await self._acquire_leadership()
                if self._is_leader and not was_leader:
                    log.info("Scheduler leadership acquired by %s", self._leader_id)
                    await self.sync_triggers()
                    last_resync = time.monotonic()
                elif not self._is_leader and was_leader:
                    log.info("Scheduler leadership lost; clearing jobs")
                    self._clear_jobs()
                elif self._is_leader and time.monotonic() - last_resync >= RESYNC_INTERVAL_S:
                    await self.sync_triggers()
                    last_resync = time.monotonic()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Scheduler maintenance cycle failed")

    def _clear_jobs(self) -> None:
        for trigger_id in list(self._jobs):
            self.remove_trigger(trigger_id)

    async def sync_triggers(self) -> None:
        """Reconcile scheduled jobs with the triggers table."""
        sc = SupabaseClient.as_service()
        try:
            triggers = await sc.select(
                "triggers",
                params={"kind": "eq.schedule", "is_active": "eq.true", "select": "*"},
            )
        except Exception as e:
            log.warning("FlowScheduler could not load triggers: %s", e)
            return

        wanted: set[str] = set()
        for trigger in triggers:
            wanted.add(trigger["id"])
            try:
                self.add_trigger(trigger)
            except Exception as e:
                log.warning("Skipping malformed schedule trigger %s: %s", trigger.get("id"), e)

        # Drop jobs whose trigger was deleted or paused on another replica.
        for trigger_id in [t for t in self._jobs if t not in wanted]:
            self.remove_trigger(trigger_id)

    async def stop(self) -> None:
        if self._maintenance is not None:
            self._maintenance.cancel()
            try:
                await self._maintenance
            except (asyncio.CancelledError, Exception):
                pass
        if self._redis is not None and self._is_leader:
            try:
                current = await self._redis.get(LEADER_KEY)
                if current and current.decode() == self._leader_id:
                    await self._redis.delete(LEADER_KEY)
            except Exception:
                pass
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def add_trigger(self, trigger: dict[str, Any]) -> None:
        if trigger.get("kind") != "schedule" or not trigger.get("is_active"):
            return
        if not self._is_leader:
            # A standby replica must not fire jobs; the leader picks this trigger
            # up on its next resync.
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
            return DateTrigger(run_date=_parse_once_at(once_at, tz), timezone=tz)
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
    if not trigger or not trigger.get("is_active"):
        return
    flow = await sc.select(
        "flows",
        params={"id": f"eq.{trigger['flow_id']}", "select": "*"},
        single=True,
    )
    if not flow or not flow.get("current_version_id"):
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
        # Lets the executor fire only this trigger's callback and clean up only
        # this one-shot schedule.
        "trigger_id": trigger_id,
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
