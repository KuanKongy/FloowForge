"""LLM node: calls a provider for text output."""
from __future__ import annotations

from typing import Any

from ...providers import get_provider
from ..context import ExecutionContext



class _LlmBrowserEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response

# Display labels (kept compatible with the existing UI dropdowns) -> backend providers.
MODEL_TO_PROVIDER: dict[str, str] = {
    "GPT o3-mini": "openai",
    "GPT-4o-mini": "openai",
    "GPT-4.1-mini": "openai",
    "Ollama": "cloudflare",
    "Llama 3 (Cloudflare)": "cloudflare",
    "Gemini": "gemini",
    "Gemini 2.5 Flash": "gemini",
    "Gemini 1.5 Flash": "gemini",
    "Gemini 1.5 Pro": "gemini",
    "Deepseek": "openai",
}


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    data = node.get("data", {}) or {}
    options: dict[str, Any] = dict(data.get("options") or {})
    options.setdefault("context", data.get("context"))
    # Tolerate the historical "tempurature" misspelling that shipped in the
    # original Floowbox proto so old graphs keep working.
    options.setdefault(
        "temperature",
        data.get("temperature", data.get("tempurature")),
    )
    options.setdefault("maxLength", data.get("maxLength"))
    # The editor's Prompt field is a useful default when the upstream value is
    # empty / missing. Providers consult ``options.prompt`` for that fallback.
    if data.get("prompt") is not None:
        options.setdefault("prompt", data.get("prompt"))
    if data.get("model") is not None:
        options.setdefault("model", data.get("model"))

    label = data.get("model") or "GPT o3-mini"
    provider_name = MODEL_TO_PROVIDER.get(label, "openai")
    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    input_value = inputs[0] if inputs else (data.get("prompt") or "")
    result = await provider.generate(
        input=input_value,
        input_type="text",
        output_type="text",
        options=options,
    )
    return result.text or ""

def _collect_llm_token_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_llm_token_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

