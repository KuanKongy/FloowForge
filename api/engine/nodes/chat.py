"""Chatbox: maintains a transcript and emits the OpenAI-compatible message list."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext



def _merge_chat_palette_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_chat_palette_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> list[dict[str, str]]:
    history: list[dict[str, str]] = list(node.get("data", {}).get("messages", []) or [])
    if inputs:
        new_user_msg = inputs[0]
        if isinstance(new_user_msg, str):
            history.append({"role": "user", "content": new_user_msg})
        elif isinstance(new_user_msg, list):
            history.extend(new_user_msg)
    return history
