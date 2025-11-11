"""Filebox: yields an opaque file reference/payload.

The File Box is deliberately not a parser. It accepts any file-shaped value and
passes that same value downstream; File Parser nodes decide how to convert it
into text/JSON/etc.
"""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


def _is_empty_trigger_input(value: Any) -> bool:
    return value is None or value == {}


def _selected_file_value(data: dict[str, Any]) -> Any:
    if data.get("value") is not None:
        return data.get("value")
    if data.get("file_ref") is not None:
        return data.get("file_ref")
    return None


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    data = node.get("data", {}) or {}
    selected = _selected_file_value(data)

    # Triggers/buttons often feed `None` (or public forms may feed `{}`) into
    # canvas input nodes. That should not erase the file chosen in the UI.
    real_inputs = [v for v in inputs if not _is_empty_trigger_input(v)]
    if real_inputs:
        return real_inputs[0]
    if selected is not None:
        return selected

    name = data.get("name") or "File Box"
    raise ValueError(f"{name} has no selected file. Choose a file in the File Box before running.")
