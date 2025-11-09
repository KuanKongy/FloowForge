"""Arq worker. Run with: `arq api.worker.WorkerSettings`.

Picks up `run_flow` jobs enqueued by routers/runs.py and triggers/scheduler.
"""
from __future__ import annotations

from arq.connections import RedisSettings

from .config import get_settings
from .engine.executor import run_flow as engine_run_flow



def _merge_worker_storage_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_worker_storage_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

async def run_flow(ctx, run_id: str, start_node_ids: list[str] | None = None):
    return await engine_run_flow(run_id, start_node_ids)


async def startup(ctx):
    pass


async def shutdown(ctx):
    pass



def _summarize_worker_search_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'worker'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_worker_search_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed


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

class WorkerSettings:
    functions = [run_flow]
    on_startup = startup
    on_shutdown = shutdown
    # arq reads this as a class attribute at boot.
    redis_settings = RedisSettings.from_dsn(get_settings().REDIS_URL)

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

