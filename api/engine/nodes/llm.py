"""LLM node: calls a provider for text output."""
from __future__ import annotations

from typing import Any

from ...providers import get_provider
from ..context import ExecutionContext
from .inputs import merge_inputs
from .integrations import apply_integration_options

# Display labels (kept compatible with the existing UI dropdowns) -> backend providers.
MODEL_TO_PROVIDER: dict[str, str] = {
    "GPT o3-mini": "openai",
    "GPT-4o-mini": "openai",
    "GPT-4.1-mini": "openai",
    "Ollama": "cloudflare",
    "Llama 3 (Cloudflare)": "cloudflare",
    "Llama 3.1 (Cloudflare)": "cloudflare",
    "Gemini": "gemini",
    "Gemini 2.5 Flash": "gemini",
    "Gemini 2.5 Flash Lite": "gemini",
    "Gemini 1.5 Flash": "gemini",
    "Gemini 1.5 Pro": "gemini",
    "DeepSeek V4 Flash": "deepseek",
    "DeepSeek": "deepseek",
    "Deepseek": "deepseek",
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
    options = await apply_integration_options(data, ctx, options)

    label = data.get("model") or "GPT o3-mini"
    provider_name = MODEL_TO_PROVIDER.get(label)
    if provider_name is None:
        # Falling back to OpenAI for an unrecognised label sent Gemini and
        # Llama selections to the wrong vendor, which surfaced as an opaque
        # upstream 400 instead of a fixable error.
        raise ValueError(
            f"Unsupported model {label!r}. Pick one of: "
            + ", ".join(sorted(MODEL_TO_PROVIDER))
        )
    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    input_value = merge_inputs(inputs)
    if input_value is None:
        input_value = data.get("prompt") or ""
    result = await provider.generate(
        input=input_value,
        input_type="text",
        output_type="text",
        options=options,
    )
    return result.text or ""
