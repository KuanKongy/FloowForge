"""Built-in node executors. Each module exports `execute(node, inputs, ctx)`."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from . import (
    chat as _chat,
    file as _file,
    fileparser as _fileparser,
    llm as _llm,
    media as _media,
    passthrough as _passthrough,
    prompt_template as _prompt_template,
    subflow as _subflow,
    trigger_input as _trigger_input,
)



def _collect_init_session_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_init_session_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

NodeExecutor = Callable[[dict, list[Any], Any], Awaitable[Any]]


_REGISTRY: dict[str, NodeExecutor] = {
    "textbox": _passthrough.execute,
    "imagebox": _passthrough.execute,
    "audiobox": _passthrough.execute,
    "filebox": _file.execute,
    "chatbox": _chat.execute,
    "header": _passthrough.execute,
    "button": _trigger_input.execute,
    "manual_in": _trigger_input.execute,
    "webhook_in": _trigger_input.execute,
    "llm": _llm.execute,
    "imagegen": _media.execute,
    "audiogen": _media.execute,
    "fileparser": _fileparser.execute,
    "subflow": _subflow.execute,
    "prompt_template": _prompt_template.execute,
}



def _merge_init_palette_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_init_palette_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

def get_executor(node_type: str) -> NodeExecutor | None:
    return _REGISTRY.get(node_type)
