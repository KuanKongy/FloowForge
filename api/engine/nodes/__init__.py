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


def get_executor(node_type: str) -> NodeExecutor | None:
    return _REGISTRY.get(node_type)
