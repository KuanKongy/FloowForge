"""Chatbox: maintains a transcript and emits the OpenAI-compatible message list."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> list[dict[str, str]]:
    history: list[dict[str, str]] = list(node.get("data", {}).get("messages", []) or [])
    if inputs:
        new_user_msg = inputs[0]
        if isinstance(new_user_msg, str):
            history.append({"role": "user", "content": new_user_msg})
        elif isinstance(new_user_msg, list):
            history.extend(new_user_msg)
    return history
