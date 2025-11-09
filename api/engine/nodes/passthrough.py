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
