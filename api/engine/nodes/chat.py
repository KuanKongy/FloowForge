"""Chatbox: maintains a transcript and emits the OpenAI-compatible message list."""
from __future__ import annotations

from typing import Any

from ..context import ExecutionContext
from .inputs import merge_inputs


def _is_message(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("role") in {"system", "user", "assistant"}
        and isinstance(value.get("content"), str)
    )


def _coerce_messages(value: Any, role: str) -> list[dict[str, str]]:
    if value is None:
        return []
    if isinstance(value, list) and all(_is_message(v) for v in value):
        return [{"role": str(v["role"]), "content": str(v["content"])} for v in value]
    if isinstance(value, str):
        return [{"role": role, "content": value}]
    return [{"role": role, "content": str(value)}]


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> list[dict[str, str]]:
    data = node.get("data", {}) or {}
    history: list[dict[str, str]] = list(data.get("messages", []) or [])

    out: list[dict[str, str]] = []
    system_prompt = str(data.get("system_prompt") or "").strip()
    if system_prompt:
        out.append({"role": "system", "content": system_prompt})
    out.extend([m for m in history if _is_message(m) and m.get("role") != "system"])

    meta = ctx.cache.get(f"__input_meta__:{node.get('id')}") if ctx else []
    meta = meta or []
    if len(inputs) > 1 and not meta:
        merged = merge_inputs(inputs)
        out.extend(_coerce_messages(merged, "user"))
        return out

    for i, value in enumerate(inputs):
        parent = meta[i] if i < len(meta) and isinstance(meta[i], dict) else {}
        role = "assistant" if parent.get("type") in {"llm", "prompt_template"} else "user"
        out.extend(_coerce_messages(value, role))
    return out
