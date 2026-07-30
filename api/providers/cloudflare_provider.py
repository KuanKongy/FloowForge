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

# Aspect token -> (width, height) for the diffusion models. Dimensions are
# multiples of 64 and stay within the ~1 MP budget Workers AI image models
# expect. ``auto`` has no model-side meaning here, so it maps to square.
_CF_ASPECT_DIMS: dict[str, tuple[int, int]] = {
    "auto": (1024, 1024),
    "square": (1024, 1024),
    "landscape": (1216, 832),
    "wide": (1216, 832),
    "portrait": (832, 1216),
    "tall": (832, 1216),
}


_MIN_IMAGE_DIM = 64
_MAX_IMAGE_DIM = 2048


def _cf_image_dims(options: dict[str, Any]) -> tuple[int, int]:
    """Resolve the output dimensions from an explicit size or an aspect hint.

    Explicit ``width``/``height`` win; otherwise a semantic ``aspect`` token or
    a ``WxH`` ``size`` string is honoured; failing everything we default to a
    1024x1024 square so nothing gets cropped into the old 800x600 letterbox.
    """
    width = options.get("width")
    height = options.get("height")
    if width and height:
        # These come straight from node options, so a non-numeric value used to
        # raise an uncaught ValueError and an enormous one just burned money.
        try:
            w, h = int(width), int(height)
        except (TypeError, ValueError):
            raise ValueError(
                f"Image width/height must be numbers, got {width!r}x{height!r}"
            ) from None
        if not (_MIN_IMAGE_DIM <= w <= _MAX_IMAGE_DIM and _MIN_IMAGE_DIM <= h <= _MAX_IMAGE_DIM):
            raise ValueError(
                f"Image dimensions must be between {_MIN_IMAGE_DIM} and "
                f"{_MAX_IMAGE_DIM} pixels, got {w}x{h}"
            )
        return w, h
    aspect = str(options.get("aspect") or "").strip().lower()
    if aspect in _CF_ASPECT_DIMS:
        return _CF_ASPECT_DIMS[aspect]
    size = str(options.get("size") or "").strip().lower()
    if "x" in size:
        try:
            w, h = (int(part) for part in size.split("x", 1))
            return w, h
        except ValueError:
            pass
    return 1024, 1024


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
        if not account_id:
            # Without this the URL became `/accounts//ai/run/...` and Cloudflare
            # answered 404 with a message about token permissions.
            raise ValueError(
                "Cloudflare account id is not configured. Set CLOUDFLARE_ID or "
                "add an account_id to the integration."
            )
        return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"

    def _headers(self, options: dict[str, Any]) -> dict[str, str]:
        credentials = self._credentials(options)
        token = credentials.get("api_key") or credentials.get("token") or get_settings().CLOUDFLARE_KEY
        if not token:
            raise ValueError(
                "Cloudflare API token is not configured. Set CLOUDFLARE_KEY or "
                "add an api_key to the integration."
            )
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
        width, height = _cf_image_dims(options)
        body: dict[str, Any] = {
            "prompt": str(prompt or ""),
            "width": width,
            "height": height,
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
