"""Prompt-template custom node executor.

`node.data` carries:
  - custom_node_id (optional): pull body/schema from custom_nodes
  - body: { prompt, model, params, inputs[], outputs[] }

If multiple typed inputs are declared, the upstream values are bound in order
to the declared input names. The prompt may reference them as `{{name}}`.
"""
from __future__ import annotations

from typing import Any

from jinja2 import Environment, StrictUndefined, TemplateError

from ...providers import get_provider
from .llm import MODEL_TO_PROVIDER
from ..context import ExecutionContext


_jinja = Environment(
    autoescape=False,
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


async def _load_body(node: dict, ctx: ExecutionContext) -> dict[str, Any]:
    body = node.get("data", {}).get("body")
    if body:
        return body
    custom_node_id = node.get("data", {}).get("custom_node_id")
    if not custom_node_id:
        return {}
    from ...db import SupabaseClient
    sc = SupabaseClient.as_service()
    rows = await sc.select(
        "custom_nodes",
        params={
            "id": f"eq.{custom_node_id}",
            "user_id": f"eq.{ctx.user_id}",
            "select": "*",
        },
        single=True,
    )
    if not rows or not isinstance(rows, dict):
        raise ValueError("Custom node not found or not owned by this user")
    return rows.get("body", {})


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    data = node.get("data", {}) or {}
    body = await _load_body(node, ctx)
    template_str: str = body.get("prompt") or data.get("prompt") or ""
    declared_inputs: list[dict[str, Any]] = body.get("inputs") or data.get("inputs") or []
    model_label: str = body.get("model") or data.get("model") or "GPT o3-mini"
    params: dict[str, Any] = body.get("params") or data.get("params") or {}

    bindings: dict[str, Any] = {}
    for i, spec in enumerate(declared_inputs):
        name = spec.get("name") or f"input{i + 1}"
        bindings[name] = inputs[i] if i < len(inputs) else None

    try:
        rendered = _jinja.from_string(template_str).render(**bindings)
    except TemplateError as e:
        raise ValueError(f"Prompt template error: {e}")

    provider_name = MODEL_TO_PROVIDER.get(model_label, "openai")
    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    result = await provider.generate(
        input=rendered,
        input_type="text",
        output_type="text",
        options={**params, "model": params.get("model")},
    )
    return result.text or ""
