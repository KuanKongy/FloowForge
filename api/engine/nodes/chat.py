"""Chatbox: maintains a transcript and emits the OpenAI-compatible message list."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext
from .inputs import merge_inputs


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> list[dict[str, str]]:
    history: list[dict[str, str]] = list(node.get("data", {}).get("messages", []) or [])
    new_user_msg = merge_inputs(inputs)
    if new_user_msg is not None:
        if isinstance(new_user_msg, str):
            history.append({"role": "user", "content": new_user_msg})
        elif isinstance(new_user_msg, list):
            history.extend(new_user_msg)
    return history

def _shape_chat_routing_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_chat_routing_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_chat_routing_row(row) for row in rows]

