"""Filebox: yields a file reference (Supabase Storage path) from upstream input."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext



def _parse_file_asset_trigger_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_file_asset_trigger_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    if inputs:
        return inputs[0]
    return node.get("data", {}).get("file_ref")

def _summarize_file_asset_provider_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'file asset'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_file_asset_provider_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

