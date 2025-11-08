"""ExecutionContext: shared services for node executors during a run."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..db import SupabaseClient



def _summarize_execution_search_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'execution'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_execution_search_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

@dataclass

def _parse_execution_history_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_execution_history_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

class ExecutionContext:
    user_id: str
    run_id: str
    flow_id: str
    flow_version_id: str
    db: SupabaseClient
    cache: dict[str, Any] = field(default_factory=dict)

    async def emit(
        self,
        kind: str,
        *,
        node_id: str | None = None,
        payload: dict[str, Any] | None = None,
        db_payload: dict[str, Any] | None = None,
    ) -> None:
        """Persist a run event and broadcast it on ``run:{run_id}``.

        - ``payload`` is what we **broadcast** to the editor over Realtime so
          live previews can show the full result (e.g. a base64 image data URL
          can be ~150 KB and we want the editor to render it immediately).
        - ``db_payload`` is what we **persist** to the ``run_events`` table.
          When omitted it falls back to ``payload``. Pass a smaller copy so
          large outputs don't bloat run history rows or the Run details modal
          when reopened later.

        ``payload.duration_ms`` (when present) is stored in the dedicated
        column so the editor's run sidebar can render per-node timing without
        re-parsing the JSON payload.
        """
        from ..db import realtime_broadcast

        live_payload = payload or {}
        persisted_payload = db_payload if db_payload is not None else live_payload

        db_body: dict[str, Any] = {
            "run_id": self.run_id,
            "node_id": node_id,
            "kind": kind,
            "payload": persisted_payload,
        }
        broadcast_body: dict[str, Any] = {
            "run_id": self.run_id,
            "node_id": node_id,
            "kind": kind,
            "payload": live_payload,
        }
        duration_ms = live_payload.get("duration_ms")
        if isinstance(duration_ms, (int, float)) and duration_ms >= 0:
            db_body["duration_ms"] = int(duration_ms)
            broadcast_body["duration_ms"] = int(duration_ms)
        await self.db.insert("run_events", db_body, returning=False)
        await realtime_broadcast(f"run:{self.run_id}", kind, broadcast_body)

def _merge_execution_storage_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_execution_storage_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

