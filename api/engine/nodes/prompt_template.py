"""Prompt-template custom node executor.

`node.data` carries:
  - custom_node_id (optional): pull body/schema from custom_nodes
  - body: { prompt, model, params, inputs[], outputs[] }

If multiple typed inputs are declared, the upstream values are bound in order
to the declared input names. The prompt may reference them as `{{name}}`.
"""
from __future__ import annotations

from typing import Any

from jinja2 import StrictUndefined, TemplateError
from jinja2.exceptions import SecurityError
from jinja2.sandbox import SandboxedEnvironment

from ...providers import get_provider
from ..context import ExecutionContext
from .integrations import apply_integration_options
from .llm import MODEL_TO_PROVIDER

# Prompt bodies are user-authored and rendered inside the worker, which holds the
# Supabase service-role key and every provider credential. A plain Environment
# lets `{{ ''.__class__.__mro__ }}` reach the interpreter, so the sandbox is a
# security boundary, not a nicety.
_jinja = SandboxedEnvironment(
    autoescape=False,
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


def _binding_key(name: str) -> str:
    key = "".join(ch.lower() if ch.isalnum() else "_" for ch in name.strip())
    key = "_".join(part for part in key.split("_") if part)
    return key or "input"


async def _load_definition(node: dict, ctx: ExecutionContext) -> dict[str, Any]:
    body = node.get("data", {}).get("body")
    if body:
        return {"body": body, "schema": node.get("data", {}).get("schema") or {}}
    custom_node_id = node.get("data", {}).get("custom_node_id")
    if not custom_node_id:
        return {"body": {}, "schema": {}}
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
    return {"body": rows.get("body", {}) or {}, "schema": rows.get("schema", {}) or {}}


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    data = node.get("data", {}) or {}
    definition = await _load_definition(node, ctx)
    body = definition["body"]
    schema = definition["schema"]
    template_str: str = body.get("prompt") or data.get("prompt") or ""
    declared_inputs: list[dict[str, Any]] = (
        schema.get("inputs")
        or body.get("inputs")
        or data.get("inputs")
        or []
    )
    model_label: str = body.get("model") or data.get("model") or "GPT o3-mini"
    params: dict[str, Any] = body.get("params") or data.get("params") or {}
    params = await apply_integration_options(data, ctx, params)

    bindings: dict[str, Any] = dict(ctx.cache.get(f"__input_bindings__:{node.get('id')}") or {})
    for i, spec in enumerate(declared_inputs):
        name = spec.get("name") or f"input{i + 1}"
        value = bindings.get(_binding_key(name), inputs[i] if i < len(inputs) else spec.get("default"))
        bindings[_binding_key(name)] = value
        if str(name).isidentifier():
            bindings[str(name)] = value
    for i, value in enumerate(inputs):
        bindings.setdefault(f"input{i + 1}", value)

    try:
        rendered = _jinja.from_string(template_str).render(**bindings)
    except SecurityError as e:
        raise ValueError(f"Prompt template blocked an unsafe expression: {e}") from e
    except TemplateError as e:
        raise ValueError(f"Prompt template error: {e}") from e

    provider_name = MODEL_TO_PROVIDER.get(model_label, "openai")
    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    result = await provider.generate(
        input=rendered,
        input_type="text",
        output_type="text",
        options={**params, "model": model_label},
    )
    return result.text or ""
