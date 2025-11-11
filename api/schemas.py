"""Pydantic models. Mirror packages/shared/src/index.ts."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


NodeType = Literal[
    "textbox", "imagebox", "audiobox", "filebox", "chatbox",
    "header", "button",
    "llm", "imagegen", "audiogen", "fileparser",
    "subflow", "prompt_template",
    "webhook_in", "manual_in", "schedule_in",
]

IoType = Literal["text", "image", "audio", "file", "json"]


class Position(BaseModel):
    x: float
    y: float


class FlowNode(BaseModel):
    id: str
    type: NodeType
    position: Position
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class FlowGraph(BaseModel):
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)


class IoPort(BaseModel):
    name: str
    type: IoType
    required: bool = False


# ----- Flow CRUD -----
class FlowCreate(BaseModel):
    name: str = "Untitled flow"
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_subflow: bool = False


class FlowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    is_subflow: bool | None = None
    is_published: bool | None = None


class FlowVersionCreate(BaseModel):
    graph: FlowGraph
    inputs: list[IoPort] = Field(default_factory=list)
    outputs: list[IoPort] = Field(default_factory=list)


# ----- Runs -----
class RunCreate(BaseModel):
    input: Any | None = None
    version_id: str | None = None
    start_node_ids: list[str] | None = None
    # Map of ``node_id -> resolved value`` used by the engine when a parent
    # of a start node is out of scope. The "Resume from this node" feature
    # uses this to inject the previous run's outputs as inputs to the resume
    # point, so a partial re-run sees the same context the failed run did.
    input_overrides: dict[str, Any] | None = None


# ----- Triggers -----
TriggerKind = Literal[
    "webhook", "schedule", "manual",
    "incoming_webhook", "outgoing_webhook", "public_form",
]


class TriggerCreate(BaseModel):
    flow_id: str
    kind: TriggerKind
    config: dict[str, Any] = Field(default_factory=dict)
    callback_url: str | None = None
    entry_node_id: str | None = None
    show_outputs: bool = False
    output_node_ids: list[str] | None = None


class TriggerUpdate(BaseModel):
    config: dict[str, Any] | None = None
    is_active: bool | None = None
    callback_url: str | None = None
    entry_node_id: str | None = None
    show_outputs: bool | None = None
    output_node_ids: list[str] | None = None


# ----- Custom nodes -----
class CustomNodeSchema(BaseModel):
    inputs: list[IoPort] = Field(default_factory=list)
    outputs: list[IoPort] = Field(default_factory=list)


class CustomNodeCreate(BaseModel):
    # "subflow" kind is reserved -- actual subflows use flows.is_subflow +
    # the subflow node type.  New custom nodes should be "prompt_template".
    kind: Literal["subflow", "prompt_template"]
    name: str
    icon: str | None = None
    schema_: CustomNodeSchema = Field(alias="schema", default_factory=CustomNodeSchema)
    body: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class CustomNodeUpdate(BaseModel):
    """Partial update -- all fields optional, ``kind`` is immutable."""
    name: str | None = None
    icon: str | None = None
    schema_: CustomNodeSchema | None = Field(alias="schema", default=None)
    body: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


# ----- Integrations -----
class IntegrationCreate(BaseModel):
    provider: Literal["openai", "gemini", "cloudflare"]
    label: str = ""
    credentials: dict[str, Any]


class IntegrationUpdate(BaseModel):
    label: str | None = None
    credentials: dict[str, Any] | None = None
