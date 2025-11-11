"""Pass-through nodes: textbox / imagebox / audiobox / header.

These exist mainly to display data in the editor. At runtime they accept the
upstream value (or the node's own static `data.value`) and pass it on.

When multiple parents are wired in, string values are concatenated with a
double newline so downstream nodes (like an LLM) see all inputs merged into
one prompt. Non-string values (images, audio blobs) cannot be meaningfully
concatenated, so the first one wins.
"""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    real_inputs = [v for v in inputs if v is not None]
    # Public form / webhook can POST `{}` when every field uses canvas defaults.
    # Treat that as "no upstream payload" so we use the node's saved `data.value`.
    if len(real_inputs) == 1 and real_inputs[0] == {}:
        real_inputs = []
    if not real_inputs:
        return node.get("data", {}).get("value")
    if len(real_inputs) == 1:
        return real_inputs[0]
    str_parts = [v for v in real_inputs if isinstance(v, str)]
    if str_parts:
        return "\n\n".join(str_parts)
    return real_inputs[0]
