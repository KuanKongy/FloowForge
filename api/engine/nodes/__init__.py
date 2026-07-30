"""Built-in node executors. Each module exports `execute(node, inputs, ctx)`."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from . import (
    chat as _chat,
)
from . import (
    file as _file,
)
from . import (
    fileparser as _fileparser,
)
from . import (
    llm as _llm,
)
from . import (
    media as _media,
)
from . import (
    passthrough as _passthrough,
)
from . import (
    prompt_template as _prompt_template,
)
from . import (
    subflow as _subflow,
)
from . import (
    trigger_input as _trigger_input,
)

NodeExecutor = Callable[[dict, list[Any], Any], Awaitable[Any]]


_REGISTRY: dict[str, NodeExecutor] = {
    "textbox": _passthrough.execute,
    "imagebox": _passthrough.execute,
    "audiobox": _passthrough.execute,
    "filebox": _file.execute,
    "chatbox": _chat.execute,
    "button": _trigger_input.execute,
    "manual_in": _trigger_input.execute,
    "webhook_in": _trigger_input.execute,
    "schedule_in": _trigger_input.execute,
    "llm": _llm.execute,
    "imagegen": _media.execute,
    "audiogen": _media.execute,
    "fileparser": _fileparser.execute,
    "subflow": _subflow.execute,
    "prompt_template": _prompt_template.execute,
}


def get_executor(node_type: str) -> NodeExecutor | None:
    return _REGISTRY.get(node_type)
