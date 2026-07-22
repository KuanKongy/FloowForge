"""OpenAI provider: chat for text, TTS for audio, DALL-E for images."""
from __future__ import annotations

import base64
import math
from typing import Any

from openai import AsyncOpenAI

from ..config import get_settings
from .base import BaseProvider, ProviderResult


# Friendly UI labels -> actual OpenAI model ids.
#
# ``dall-e-3`` was retired from the Images API — it now answers
# "The model 'dall-e-3' does not exist" — so every saved flow that still
# carries the old label is remapped onto ``gpt-image-1``.
_MODEL_LABEL_TO_ID: dict[str, str] = {
    "gpt o3-mini": "gpt-4o-mini",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4.1-mini": "gpt-4.1-mini",
    "tts-1": "tts-1",
    "dalle 3": "gpt-image-1",
    "dall-e 3": "gpt-image-1",
    "dall-e-3": "gpt-image-1",
    "dalle 2": "gpt-image-1",
    "dall-e-2": "gpt-image-1",
    "gpt image 1": "gpt-image-1",
    "gpt-image-1": "gpt-image-1",
    "gpt-image-1-mini": "gpt-image-1-mini",
}

# The only sizes ``gpt-image-*`` accepts. DALL-E-era sizes (512x512,
# 1792x1024, …) are coerced to the closest supported aspect ratio rather than
# failing the run.
_GPT_IMAGE_SIZES = frozenset({"1024x1024", "1024x1536", "1536x1024", "auto"})

# Semantic aspect tokens the Image AI node emits, mapped onto the gpt-image
# sizes. ``auto`` lets the model choose the best shape for the prompt instead
# of squeezing every scene into a square — a square output made wide/tall
# subjects look cropped, which is exactly what users reported.
_ASPECT_TO_GPT_IMAGE_SIZE: dict[str, str] = {
    "auto": "auto",
    "square": "1024x1024",
    "landscape": "1536x1024",
    "wide": "1536x1024",
    "portrait": "1024x1536",
    "tall": "1024x1536",
}


def _normalize_model(label: str | None, default: str) -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _MODEL_LABEL_TO_ID.get(key, label)


def _coerce_image_size(size: Any, model: str) -> str:
    """Resolve a UI aspect/size hint to a size the target model accepts.

    ``size`` may be a semantic token (``auto``/``square``/``landscape``/
    ``portrait``), an explicit ``WxH`` string, or ``None``. When nothing is
    specified we default to ``auto`` so gpt-image picks the shape that fits the
    prompt rather than cropping it into a square.
    """
    value = str(size or "auto").strip().lower()
    if not model.startswith("gpt-image"):
        # DALL-E-era models keep whatever explicit size the caller asked for.
        return "1024x1024" if value == "auto" else value
    if value in _ASPECT_TO_GPT_IMAGE_SIZE:
        return _ASPECT_TO_GPT_IMAGE_SIZE[value]
    if value in _GPT_IMAGE_SIZES:
        return value
    try:
        width, height = (int(part) for part in value.split("x", 1))
    except ValueError:
        return "auto"
    if width > height:
        return "1536x1024"
    if height > width:
        return "1024x1536"
    return "1024x1024"


class OpenAIProvider(BaseProvider):
    name = "openai"

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(api_key=get_settings().OPENAI_API_KEY)
        return self._client

    def _client_for(self, options: dict[str, Any]) -> AsyncOpenAI:
        credentials = options.get("provider_credentials")
        if isinstance(credentials, dict) and credentials.get("api_key"):
            return AsyncOpenAI(api_key=str(credentials["api_key"]))
        return self.client

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
        if output_type == "audio":
            return await self._audio(input, options)
        if output_type == "image":
            return await self._image(input, options)
        raise ValueError(f"Unsupported output_type: {output_type}")

    async def _text(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        context = (options.get("context") or "").strip() or "You are a helpful assistant."
        max_tokens = options.get("maxLength")
        # Tolerate both `temperature` and the legacy `tempurature` typo.
        temperature = options.get("temperature", options.get("tempurature"))
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

        params: dict[str, Any] = {
            "model": _normalize_model(options.get("model"), "gpt-4o-mini"),
            "messages": messages,
        }
        if isinstance(max_tokens, (int, float)) and max_tokens > 0:
            params["max_completion_tokens"] = math.floor(max_tokens)
        if isinstance(temperature, (int, float)):
            # UI scale 0..1 -> OpenAI 0..2.
            params["temperature"] = max(0.0, min(2.0, float(temperature) * 2.0))

        completion = await self._client_for(options).chat.completions.create(**params)
        text = completion.choices[0].message.content or ""
        return ProviderResult(text=text)

    async def _audio(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        text_input = input
        if (text_input is None or text_input == "") and options.get("prompt"):
            text_input = options["prompt"]
        params: dict[str, Any] = {
            "model": _normalize_model(options.get("model"), "tts-1"),
            "input": str(text_input or ""),
            "voice": options.get("voice") or "alloy",
        }
        speed = options.get("speed")
        if isinstance(speed, (int, float)):
            params["speed"] = max(0.25, float(speed))

        async with self._client_for(options).audio.speech.with_streaming_response.create(**params) as response:
            data = await response.read()
        return ProviderResult(blob=data, mime="audio/mpeg")

    async def _image(self, input: Any, options: dict[str, Any]) -> ProviderResult:
        prompt = input if isinstance(input, str) and input.strip() else (options.get("prompt") or "")
        model = _normalize_model(options.get("model"), "gpt-image-1")
        params: dict[str, Any] = {
            "model": model,
            "prompt": str(prompt or ""),
            "size": _coerce_image_size(options.get("size") or options.get("aspect"), model),
            "n": 1,
        }
        # ``gpt-image-*`` always returns base64 and rejects ``response_format``
        # outright ("Unknown parameter: 'response_format'"), which is what made
        # every image run fail. Only the older DALL-E models need it.
        if not model.startswith("gpt-image"):
            params["response_format"] = "b64_json"
        result = await self._client_for(options).images.generate(**params)
        b64 = result.data[0].b64_json or ""
        if not b64:
            return ProviderResult(text="OpenAI image generation returned no data.")
        return ProviderResult(blob=base64.b64decode(b64), mime="image/png")
