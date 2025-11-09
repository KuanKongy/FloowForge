"""Filebox: yields a file reference (Supabase Storage path) from upstream input."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    if inputs:
        return inputs[0]
    return node.get("data", {}).get("file_ref")
