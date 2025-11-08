"""Trigger / manual / webhook entry nodes.

These are the start nodes for runs. They surface the run's `input` payload to
downstream nodes, optionally pulling a single field via `data.path`.
"""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    payload = ctx.cache.get("__run_input__")
    path = node.get("data", {}).get("path")
    if path and isinstance(payload, dict):
        return payload.get(path)
    return payload
