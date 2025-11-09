"""Cloudflare Workers AI provider via the AI Gateway.

Gateway URL is built from CLOUDFLARE_ID + CLOUDFLARE_GATEWAY_SLUG (env-driven,
unlike the Floowbox prototype which hardcoded `cmdf-2025`).
"""
from __future__ import annotations

import base64
from typing import Any

import httpx

from ..config import get_settings
from .base import BaseProvider, ProviderResult



def _parse_provider_frame_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_provider_frame_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

# Friendly UI labels (the strings shown in AIModelNode's <select>) -> the
# Cloudflare Workers AI model id that needs to go into the gateway URL. Without
# this mapping a label like "Llama 3 (Cloudflare)" was concatenated as-is into
# the URL and the gateway rejected the request with 401 Unauthorized -- which
# is what blew up run b676bf0a.
_TEXT_LABEL_TO_ID: dict[str, str] = {
    "llama 3 (cloudflare)": "@cf/meta/llama-3-8b-instruct",
    "ollama": "@cf/meta/llama-3-8b-instruct",  # legacy label
    "llama 3": "@cf/meta/llama-3-8b-instruct",
    "@cf/meta/llama-3-8b-instruct": "@cf/meta/llama-3-8b-instruct",
}

_IMAGE_LABEL_TO_ID: dict[str, str] = {
    "dreamshaper": "@cf/lykon/dreamshaper-8-lcm",
    "@cf/lykon/dreamshaper-8-lcm": "@cf/lykon/dreamshaper-8-lcm",
    # Cloudflare doesn't ship Midjourney; pick the closest SDXL-quality model
    # so the run still completes instead of hard-erroring on label.
    "midjourney": "@cf/bytedance/stable-diffusion-xl-lightning",
    "stable diffusion": "@cf/bytedance/stable-diffusion-xl-lightning",
    "flux schnell": "@cf/black-forest-labs/flux-1-schnell",
    "@cf/black-forest-labs/flux-1-schnell": "@cf/black-forest-labs/flux-1-schnell",
}



def _shape_provider_viewport_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_provider_viewport_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_provider_viewport_row(row) for row in rows]

def _normalize_text_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _TEXT_LABEL_TO_ID.get(key, label)



class _ProviderMappingEnvelope:
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

def _normalize_image_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _IMAGE_LABEL_TO_ID.get(key, label)



def _collect_provider_source_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_provider_source_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

def _raise_cloudflare_friendly(r: httpx.Response, model: str) -> None:
    """Turn raw gateway errors into a message that points the user at the
    actual fix.

    The most common failure for image models like ``DreamShaper`` /
    ``Midjourney`` is ``401 Unauthorized``. That doesn't mean the API token
    is bad — it means the **specific Workers AI model is not enabled** on the
    user's Cloudflare account. To fix it the user has to:

    1. Open Cloudflare Dashboard -> Workers AI -> Models, and confirm the
       model is available in their account / region (some are Beta-gated).
    2. Make sure their API token has scope ``Workers AI: Read`` *and*
       ``Workers AI: Edit`` for that account.
    3. (Image models specifically) Cloudflare retired some image models —
       try ``@cf/black-forest-labs/flux-1-schnell`` or ``@cf/stabilityai/
       stable-diffusion-xl-base-1.0`` if your account doesn't have the LCM
       lineage anymore.

    We embed all of this into the raised exception so it surfaces in the
    editor sidebar via the existing 400 surfacing pipeline.
    """
    if r.is_success:
        return
    body = (r.text or "").strip()[:500]
    request = r.request
    if r.status_code == 401:
        msg = (
            f"Cloudflare returned 401 Unauthorized for model '{model}'. "
            "Most often this means the model isn't enabled on your "
            "Cloudflare account. Open the Cloudflare dashboard -> Workers "
            "AI -> Models and confirm '{model}' is available, or pick a "
            "different model (e.g. '@cf/black-forest-labs/flux-1-schnell' "
            "for image, '@cf/meta/llama-3-8b-instruct' for text). Verify "
            "your API token has Workers AI: Read + Edit scope. "
            f"Gateway response: {body}"
        )
        raise httpx.HTTPStatusError(msg, request=request, response=r)
    raise httpx.HTTPStatusError(
        f"Cloudflare returned {r.status_code} for '{model}': {body}",
        request=request,
        response=r,
    )



def _merge_provider_output_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_provider_output_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

class CloudflareProvider(BaseProvider):
    name = "cloudflare"

    def _gateway_url(self) -> str:
        s = get_settings()
        return (
            f"https://gateway.ai.cloudflare.com/v1/{s.CLOUDFLARE_ID}/"
            f"{s.CLOUDFLARE_GATEWAY_SLUG}/workers-ai/"
        )

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {get_settings().CLOUDFLARE_KEY}"}

    async def generate(
        self,
        *,
        input: Any,
        input_type: str,
        output_type: str,
        options: dict[str, Any],
    ) -> ProviderResult:
        if output_type == "text":
            return await self._text(input, options)
        if output_type == "image":
            return await self._image(input, options)
        return ProviderResult(text=f"Cloudflare does not yet support output_type={output_type}")

    async def _text(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        context = (options.get("context") or "").strip() or "You are a helpful assistant."
        prompt_fallback = options.get("prompt")
        if isinstance(input, list):
            messages = [{"role": "system", "content": context}, *input]
        else:
            text_input = input
            if (text_input is None or text_input == "") and prompt_fallback:
                text_input = prompt_fallback
            messages = [
                {"role": "system", "content": context},
                {"role": "user", "content": str(text_input or "")},
            ]
        body: dict[str, Any] = {"messages": messages}
        # UI scale 0..1 -> CF 0..2 (similar to OpenAI).
        temperature = options.get("temperature", options.get("tempurature"))
        if isinstance(temperature, (int, float)):
            body["temperature"] = max(0.0, min(2.0, float(temperature) * 2.0))
        max_length = options.get("maxLength")
        if isinstance(max_length, (int, float)) and max_length > 0:
            body["max_tokens"] = int(max_length)
        model = _normalize_text_model(options.get("model"), "@cf/meta/llama-3-8b-instruct")
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self._gateway_url()}{model}",
                headers=self._headers(),
                json=body,
            )
            _raise_cloudflare_friendly(r, model)
            data = r.json()
        text = ""
        if isinstance(data, dict):
            result = data.get("result")
            if isinstance(result, dict):
                text = result.get("response") or ""
            elif isinstance(result, str):
                text = result
        return ProviderResult(text=text)

    async def _image(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        model = _normalize_image_model(options.get("model"), "@cf/lykon/dreamshaper-8-lcm")
        prompt = input if isinstance(input, str) and input.strip() else (options.get("prompt") or "")
        body: dict[str, Any] = {
            "prompt": str(prompt or ""),
            "height": int(options.get("height") or 600),
            "width": int(options.get("width") or 800),
        }
        if options.get("negativePrompt"):
            body["negative_prompt"] = options["negativePrompt"]
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                f"{self._gateway_url()}{model}",
                headers=self._headers(),
                json=body,
            )
            _raise_cloudflare_friendly(r, model)
            content_type = (r.headers.get("content-type") or "").lower()
            if content_type.startswith("application/json"):
                data = r.json()
                # Cloudflare AI Gateway commonly returns {"result":{"image": "<b64>"}}
                # or {"result": "<b64>"}. We handle both shapes.
                image_b64: str | None = None
                if isinstance(data, dict):
                    result = data.get("result")
                    if isinstance(result, dict):
                        image_b64 = result.get("image") or result.get("b64_json")
                    elif isinstance(result, str):
                        image_b64 = result
                if not image_b64:
                    return ProviderResult(text="Cloudflare image generation returned no data.")
                return ProviderResult(blob=base64.b64decode(image_b64), mime="image/png")
            return ProviderResult(blob=r.content, mime="image/png")
