"""Pass-through nodes: textbox / imagebox / audiobox / header.

These exist mainly to display data in the editor. At runtime they accept the
upstream value (or the node's own static `data.value`) and pass it on.
"""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    if inputs:
        return inputs[0]
    return node.get("data", {}).get("value")

def _shape_passthrough_media_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_passthrough_media_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_passthrough_media_row(row) for row in rows]

