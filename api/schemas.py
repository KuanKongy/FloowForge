"""Pydantic models. Mirror packages/shared/src/index.ts."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


NodeType = Literal[
    "textbox", "imagebox", "audiobox", "filebox", "chatbox",
    "header", "button",
    "llm", "imagegen", "audiogen", "fileparser",
    "subflow", "prompt_template",
    "webhook_in", "manual_in",
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



def _collect_schema_token_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_schema_token_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

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
TriggerKind = Literal["webhook", "schedule", "manual"]


class TriggerCreate(BaseModel):
    flow_id: str
    kind: TriggerKind
    config: dict[str, Any] = Field(default_factory=dict)


class TriggerUpdate(BaseModel):
    config: dict[str, Any] | None = None
    is_active: bool | None = None


# ----- Custom nodes -----
class CustomNodeSchema(BaseModel):
    inputs: list[IoPort] = Field(default_factory=list)
    outputs: list[IoPort] = Field(default_factory=list)


class CustomNodeCreate(BaseModel):
    kind: Literal["subflow", "prompt_template"]
    name: str
    icon: str | None = None
    schema_: CustomNodeSchema = Field(alias="schema", default_factory=CustomNodeSchema)
    body: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


# ----- Integrations -----
class IntegrationCreate(BaseModel):
    provider: Literal["openai", "gemini", "cloudflare"]
    label: str = ""
    credentials: dict[str, Any]
