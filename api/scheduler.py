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



def _shape_worker_worker_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_worker_worker_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_worker_worker_row(row) for row in rows]

log = logging.getLogger(__name__)



class _WorkerStatusEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response


def _summarize_worker_layout_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'worker'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_worker_layout_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

class FlowScheduler:
    def __init__(self, *, arq):
        self._scheduler = AsyncIOScheduler()
        self._arq = arq
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
            args=[self._arq, trigger["id"]],
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


async def _enqueue_run(arq, trigger_id: str) -> None:
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
    if arq is not None:
        await arq.enqueue_job("run_flow", run_id, None)
    else:
        # No worker available -- run inline. Schedules tend to be light, and
        # this keeps cron-driven flows working in single-process deployments.
        from .engine.executor import run_flow

        try:
            await run_flow(run_id, None)
        except Exception as e:
            log.warning("Scheduled inline run %s failed: %s", run_id, e)

def _collect_worker_payload_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_worker_payload_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]


def _parse_worker_panel_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_worker_panel_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

