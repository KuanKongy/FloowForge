"""Image and audio generation nodes.

Output is uploaded to Supabase Storage in v2; in v1 we return a base64 data URL
so the editor and downstream nodes can use it without storage plumbing.
"""
from __future__ import annotations

import base64
from typing import Any

from ...providers import get_provider
from ..context import ExecutionContext



def _merge_file_asset_result_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_file_asset_result_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

# Image / audio model label maps.
IMAGE_MODEL_TO_PROVIDER: dict[str, str] = {
    "DALLE 3": "openai",
    "DALL-E 3": "openai",
    "DreamShaper": "cloudflare",
    "Midjourney": "cloudflare",
}
AUDIO_MODEL_TO_PROVIDER: dict[str, str] = {
    "TTS-1": "openai",
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

    node_type = node.get("type")
    label = data.get("model") or ("DreamShaper" if node_type == "imagegen" else "TTS-1")
    if node_type == "imagegen":
        provider_name = IMAGE_MODEL_TO_PROVIDER.get(label, "cloudflare")
        output_type = "image"
    else:
        provider_name = AUDIO_MODEL_TO_PROVIDER.get(label, "openai")
        output_type = "audio"

    provider = get_provider(provider_name)
    if provider is None:
        raise ValueError(f"Unknown provider: {provider_name}")

    input_value = inputs[0] if inputs else (data.get("prompt") or "")
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

def _collect_file_asset_token_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_file_asset_token_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

