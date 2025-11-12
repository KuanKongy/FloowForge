"""Image and audio generation nodes.

Output is uploaded to Supabase Storage in v2; in v1 we return a base64 data URL
so the editor and downstream nodes can use it without storage plumbing.
"""
from __future__ import annotations

import base64
from typing import Any

from ...providers import get_provider
from ..context import ExecutionContext
from .inputs import merge_inputs
from .integrations import apply_integration_options


# Image / audio model label maps.
IMAGE_MODEL_TO_PROVIDER: dict[str, str] = {
    "DALLE 3": "openai",
    "DALL-E 3": "openai",
    "DreamShaper": "cloudflare",
    "Flux Schnell": "cloudflare",
    "Midjourney": "cloudflare",
}
AUDIO_MODEL_TO_PROVIDER: dict[str, str] = {
    "TTS-1": "openai",
    "Aura 2 (Cloudflare)": "cloudflare",
}


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    data = node.get("data", {}) or {}
    options: dict[str, Any] = dict(data.get("options") or {})
    options.setdefault("voice", data.get("voice"))
    options.setdefault("speed", data.get("speed"))
    options.setdefault("negativePrompt", data.get("negativePrompt"))
    if data.get("prompt") is not None:
        options.setdefault("prompt", data.get("prompt"))
    if data.get("model") is not None:
        options.setdefault("model", data.get("model"))
    options = await apply_integration_options(data, ctx, options)

    node_type = node.get("type")
    label = data.get("model") or ("DALLE 3" if node_type == "imagegen" else "TTS-1")
    if node_type == "imagegen":
        provider_name = IMAGE_MODEL_TO_PROVIDER.get(label, "cloudflare")
        output_type = "image"
    else:
        provider_name = AUDIO_MODEL_TO_PROVIDER.get(label, "openai")
        output_type = "audio"

    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    input_value = merge_inputs(inputs)
    if input_value is None:
        input_value = data.get("prompt") or ""
    result = await provider.generate(
        input=input_value,
        input_type="text",
        output_type=output_type,
        options=options,
    )
    if result.text:
        return result.text
    if result.blob is not None:
        b64 = base64.b64encode(result.blob).decode("ascii")
        return f"data:{result.mime};base64,{b64}"
    return ""
