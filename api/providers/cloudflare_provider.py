"""Cloudflare Workers AI provider using the direct Workers AI REST API."""
from __future__ import annotations

import base64
from typing import Any

import httpx

from ..config import get_settings
from .base import BaseProvider, ProviderResult


# ``@cf/meta/llama-3-8b-instruct`` was deprecated on 2026-05-30 and now returns
# HTTP 410, so every label that used to point at it — including the raw model
# id saved in older graphs — is remapped onto the 3.1 replacement.
_LLAMA_DEFAULT = "@cf/meta/llama-3.1-8b-instruct-fp8"

_TEXT_LABEL_TO_ID: dict[str, str] = {
    "llama 3 (cloudflare)": _LLAMA_DEFAULT,
    "llama 3.1 (cloudflare)": _LLAMA_DEFAULT,
    "ollama": _LLAMA_DEFAULT,  # legacy label
    "llama 3": _LLAMA_DEFAULT,
    "llama 3.1": _LLAMA_DEFAULT,
    "@cf/meta/llama-3-8b-instruct": _LLAMA_DEFAULT,
    "@cf/meta/llama-3.1-8b-instruct": _LLAMA_DEFAULT,
    _LLAMA_DEFAULT: _LLAMA_DEFAULT,
}

_AUDIO_LABEL_TO_ID: dict[str, str] = {
    "aura 2 (cloudflare)": "@cf/deepgram/aura-2-en",
    "aura-2-en": "@cf/deepgram/aura-2-en",
    "@cf/deepgram/aura-2-en": "@cf/deepgram/aura-2-en",
    "aura 1 (cloudflare)": "@cf/deepgram/aura-1",
    "@cf/deepgram/aura-1": "@cf/deepgram/aura-1",
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


def _normalize_text_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _TEXT_LABEL_TO_ID.get(key, label)


def _normalize_image_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _IMAGE_LABEL_TO_ID.get(key, label)


def _normalize_audio_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _AUDIO_LABEL_TO_ID.get(key, label)


def _raise_cloudflare_friendly(r: httpx.Response, model: str) -> None:
    if r.is_success:
        return
    body = (r.text or "").strip()[:500]
    request = r.request
    if r.status_code == 401:
        msg = (
            f"Cloudflare returned 401 Unauthorized for model '{model}'. "
            "Verify the token has Workers AI Read + Write permissions for "
            "the selected account and that the model is available. "
            f"Workers AI response: {body}"
        )
        raise httpx.HTTPStatusError(msg, request=request, response=r)
    raise httpx.HTTPStatusError(
        f"Cloudflare returned {r.status_code} for '{model}': {body}",
        request=request,
        response=r,
    )


class CloudflareProvider(BaseProvider):
    name = "cloudflare"

    def _credentials(self, options: dict[str, Any]) -> dict[str, Any]:
        credentials = options.get("provider_credentials")
        return credentials if isinstance(credentials, dict) else {}

    def _run_url(self, options: dict[str, Any], model: str) -> str:
        s = get_settings()
        credentials = self._credentials(options)
        account_id = credentials.get("account_id") or s.CLOUDFLARE_ID
        return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"

    def _headers(self, options: dict[str, Any]) -> dict[str, str]:
        credentials = self._credentials(options)
        token = credentials.get("api_key") or credentials.get("token") or get_settings().CLOUDFLARE_KEY
        return {"Authorization": f"Bearer {token}"}

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
        if output_type == "audio":
            return await self._audio(input, options)
        return ProviderResult(text=f"Cloudflare does not support output_type={output_type}")

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
        model = _normalize_text_model(options.get("model"), _LLAMA_DEFAULT)
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                self._run_url(options, model),
                headers=self._headers(options),
                json=body,
            )
            _raise_cloudflare_friendly(r, model)
            data = r.json()
        text = ""
        if isinstance(data, dict):
            result = data.get("result")
            if isinstance(result, dict):
                # Older Workers AI models answer with ``{"response": "..."}``;
                # the newer ones (llama 3.2/3.3, gpt-oss, …) use the
                # OpenAI-shaped ``choices[0].message.content``.
                text = result.get("response") or ""
                if not text:
                    choices = result.get("choices")
                    if isinstance(choices, list) and choices:
                        first = choices[0]
                        if isinstance(first, dict):
                            message = first.get("message")
                            if isinstance(message, dict):
                                text = message.get("content") or ""
                            if not text:
                                text = first.get("text") or ""
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
                self._run_url(options, model),
                headers=self._headers(options),
                json=body,
            )
            _raise_cloudflare_friendly(r, model)
            content_type = (r.headers.get("content-type") or "").lower()
            if content_type.startswith("application/json"):
                data = r.json()
                # Workers AI commonly returns {"result":{"image": "<b64>"}}
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

    async def _audio(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        model = _normalize_audio_model(options.get("model"), "@cf/deepgram/aura-2-en")
        text_input = input
        if (text_input is None or text_input == "") and options.get("prompt"):
            text_input = options["prompt"]
        body = {"text": str(text_input or "")}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                self._run_url(options, model),
                headers=self._headers(options),
                json=body,
            )
            _raise_cloudflare_friendly(r, model)
            content_type = (r.headers.get("content-type") or "").lower()
            if content_type.startswith("application/json"):
                data = r.json()
                result = data.get("result") if isinstance(data, dict) else None
                audio_b64: str | None = None
                if isinstance(result, dict):
                    audio_b64 = result.get("audio") or result.get("audio_b64")
                elif isinstance(result, str):
                    audio_b64 = result
                if audio_b64:
                    return ProviderResult(blob=base64.b64decode(audio_b64), mime="audio/mpeg")
                return ProviderResult(text="Cloudflare audio generation returned no data.")
            return ProviderResult(blob=r.content, mime=content_type or "audio/mpeg")
