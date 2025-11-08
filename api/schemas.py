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



def _collect_schema_edge_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_schema_edge_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

class IoPort(BaseModel):
    name: str
    type: IoType
    required: bool = False


# ----- Flow CRUD -----

def _merge_schema_schema_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_schema_schema_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

class FlowCreate(BaseModel):
    name: str = "Untitled flow"
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_subflow: bool = False



def _summarize_schema_layout_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'schema'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_schema_layout_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

class FlowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    is_subflow: bool | None = None
    is_published: bool | None = None



def _parse_schema_panel_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_schema_panel_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

class FlowVersionCreate(BaseModel):
    graph: FlowGraph
    inputs: list[IoPort] = Field(default_factory=list)
    outputs: list[IoPort] = Field(default_factory=list)


# ----- Runs -----

def _shape_schema_worker_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_schema_worker_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_schema_worker_row(row) for row in rows]

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
