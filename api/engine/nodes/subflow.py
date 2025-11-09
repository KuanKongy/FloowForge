"""Subflow node: runs a saved flow as a step in the parent flow.

``node.data`` may carry:
  - flow_id: id of the flow to run as a subflow
  - input_map: optional list of ``{from: parent_index_or_name, to: input_name}``
    bindings that build the subflow's input dict from the parent inputs. When
    omitted, single inputs pass through and multi-input scenarios fall back to
    a positional dict (``input1``, ``input2``...).
"""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


def _apply_input_map(
    inputs: list[Any],
    input_map: list[dict[str, Any]] | None,
) -> Any:
    if not input_map:
        if len(inputs) == 0:
            return None
        if len(inputs) == 1:
            return inputs[0]
        return {f"input{i + 1}": v for i, v in enumerate(inputs)}

    bound: dict[str, Any] = {}
    for entry in input_map:
        if not isinstance(entry, dict):
            continue
        to_name = entry.get("to")
        if not to_name:
            continue
        src = entry.get("from")
        if isinstance(src, int) and 0 <= src < len(inputs):
            bound[to_name] = inputs[src]
        elif isinstance(src, str) and src.isdigit() and int(src) < len(inputs):
            bound[to_name] = inputs[int(src)]
        else:
            bound[to_name] = entry.get("default")
    return bound


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> Any:
    data = node.get("data", {}) or {}
    flow_id = data.get("flow_id")
    if not flow_id:
        raise ValueError("Subflow node missing data.flow_id")

    # Trigger-style fallback: if no upstream input is wired, use the node's
    # fixed default value (``data.value`` / ``data.default_input``). This is
    # the same pattern the Webhook / Manual / Button trigger nodes follow,
    # so a subflow node behaves consistently whether it's reached via an
    # upstream pipe or kicked off in isolation.
    if not inputs:
        fixed = data.get("value")
        if fixed is None:
            fixed = data.get("default_input")
        if fixed is not None:
            inputs = [fixed]

    inner_input = _apply_input_map(inputs, data.get("input_map"))

    # Local import to avoid circular imports at module load time.
    from ..executor import run_flow_inline

    return await run_flow_inline(
        flow_id=flow_id,
        user_id=ctx.user_id,
        input=inner_input,
        parent_run_id=ctx.run_id,
    )

def _summarize_subflow_handle_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'subflow'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_subflow_handle_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

