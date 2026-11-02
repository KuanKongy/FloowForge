"""DeepSeek provider via its OpenAI-compatible chat API."""
from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from ..config import get_settings
from .base import BaseProvider, ProviderResult

# ``deepseek-v4-flash`` was retired on 2026-09-10; ``deepseek-flash`` is the
# only id DeepSeek sanctions for this tier (currently served by V4.1-Flash).
_MODEL_LABEL_TO_ID: dict[str, str] = {
    "deepseek v4.1 flash": "deepseek-flash",
    "deepseek-flash": "deepseek-flash",
    # Legacy label from saved FloowForge graphs.
    "deepseek v4 flash": "deepseek-flash",
    "deepseek-v4-flash": "deepseek-flash",
}


def _normalize_model(label: str | None) -> str:
    if not label:
        return "deepseek-flash"
    return _MODEL_LABEL_TO_ID.get(str(label).strip().lower(), str(label))


class DeepSeekProvider(BaseProvider):
    name = "deepseek"

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=get_settings().DEEPSEEK_API_KEY,
                base_url="https://api.deepseek.com",
            )
        return self._client

    def _client_for(self, options: dict[str, Any]) -> AsyncOpenAI:
        credentials = options.get("provider_credentials")
        if isinstance(credentials, dict) and credentials.get("api_key"):
            return AsyncOpenAI(
                api_key=str(credentials["api_key"]),
                base_url="https://api.deepseek.com",
            )
        return self.client

    async def generate(
        self,
        *,
        input: Any,
        input_type: str,
        output_type: str,
        options: dict[str, Any],
    ) -> ProviderResult:
        if output_type != "text":
            return ProviderResult(text=f"DeepSeek does not support output_type={output_type}")

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

        params: dict[str, Any] = {
            "model": _normalize_model(options.get("model")),
            "messages": messages,
        }
        temperature = options.get("temperature", options.get("tempurature"))
        if isinstance(temperature, (int, float)):
            params["temperature"] = max(0.0, min(2.0, float(temperature) * 2.0))
        max_tokens = options.get("maxLength")
        if isinstance(max_tokens, (int, float)) and max_tokens > 0:
            params["max_tokens"] = int(max_tokens)

        completion = await self._client_for(options).chat.completions.create(**params)
        return ProviderResult(text=completion.choices[0].message.content or "")
