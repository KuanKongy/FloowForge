"""Google Gemini provider (text only in v1)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from google import genai

from ..config import get_settings
from .base import BaseProvider, ProviderResult

log = logging.getLogger(__name__)


# UI labels (the strings the AIModelNode dropdown ships) -> google-genai
# model ids. Keep old saved labels mapped to current equivalents so existing
# workflows do not call deprecated model ids.
_LABEL_TO_ID: dict[str, str] = {
    "gemini": "gemini-flash-latest",
    "gemini 2.5": "gemini-2.5-flash",
    "gemini 2.5 flash": "gemini-2.5-flash",
    "gemini 2.5 flash lite": "gemini-2.5-flash-lite",
    "gemini 2.5 flash-lite": "gemini-2.5-flash-lite",
    # ``gemini-2.5-pro`` answers "no longer available to new users"; the
    # rolling ``-latest`` alias is the accessible Pro tier.
    "gemini 2.5 pro": "gemini-pro-latest",
    "gemini-2.5-pro": "gemini-pro-latest",
    "gemini pro": "gemini-pro-latest",
    "gemini-pro-latest": "gemini-pro-latest",
    # 2.0 and 1.5 are retired ("no longer available" / 404 on v1beta), so the
    # old labels now resolve to their closest live 2.5 equivalent.
    "gemini 2.0": "gemini-2.5-flash",
    "gemini 2.0 flash": "gemini-2.5-flash",
    "gemini 1.5 flash": "gemini-2.5-flash-lite",
    "gemini 1.5 pro": "gemini-pro-latest",
    "gemini-flash-latest": "gemini-flash-latest",
    "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gemini-2.0-flash": "gemini-2.5-flash",
    "gemini-1.5-flash": "gemini-2.5-flash-lite",
    "gemini-1.5-pro": "gemini-pro-latest",
}

# Gemini answers 503 UNAVAILABLE ("experiencing high demand") often enough that
# a single spike would otherwise fail a whole run. Retry a couple of times
# before giving up.
_RETRY_DELAYS = (1.0, 3.0)


def _is_transient(exc: Exception) -> bool:
    """True for overload / rate-limit errors that are worth retrying."""
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code in (429, 500, 502, 503, 504):
        return True
    text = str(exc)
    return any(marker in text for marker in ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "429"))


def _normalize_model(label: str | None, default: str = "gemini-flash-latest") -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _LABEL_TO_ID.get(key, label)


def _to_gemini_contents(input: Any, prompt_fallback: str | None) -> list[Any]:
    """Convert flexible inputs to Gemini's ``contents`` format.

    Supports:
    * a plain string -> single user message.
    * a list of OpenAI-style ``{role, content}`` dicts -> mapped to
      Gemini's ``{role, parts:[{text}]}`` shape (system messages are coerced
      to user as Gemini does not expose a system role on every model).
    * an empty input + ``options.prompt`` fallback.
    """
    if isinstance(input, list):
        out: list[dict[str, Any]] = []
        for msg in input:
            if not isinstance(msg, dict):
                out.append({"role": "user", "parts": [{"text": str(msg)}]})
                continue
            role = msg.get("role") or "user"
            if role == "assistant":
                role = "model"
            elif role == "system":
                # Prepend system text as a leading user message; that mirrors
                # how the OpenAI provider already injects context.
                role = "user"
            content = msg.get("content")
            text = content if isinstance(content, str) else str(content or "")
            out.append({"role": role, "parts": [{"text": text}]})
        if out:
            return out

    if input is None or input == "":
        if prompt_fallback:
            return [str(prompt_fallback)]
        return [""]
    return [str(input)]


class GeminiProvider(BaseProvider):
    name = "gemini"

    def __init__(self) -> None:
        self._client: genai.Client | None = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=get_settings().GEMINI_KEY)
        return self._client

    def _client_for(self, options: dict[str, Any]) -> genai.Client:
        credentials = options.get("provider_credentials")
        if isinstance(credentials, dict) and credentials.get("api_key"):
            return genai.Client(api_key=str(credentials["api_key"]))
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
            return ProviderResult(text=f"Gemini does not yet support output_type={output_type}")

        model = _normalize_model(options.get("model"))
        contents = _to_gemini_contents(input, options.get("prompt"))

        # google-genai is sync; offload to a thread.
        def _run() -> str:
            response = self._client_for(options).models.generate_content(model=model, contents=contents)
            return response.text or ""

        for attempt in range(len(_RETRY_DELAYS) + 1):
            try:
                text = await asyncio.to_thread(_run)
                break
            except Exception as exc:
                if attempt >= len(_RETRY_DELAYS) or not _is_transient(exc):
                    raise
                delay = _RETRY_DELAYS[attempt]
                log.warning(
                    "Gemini %s unavailable (%s); retrying in %.0fs",
                    model,
                    str(exc)[:120],
                    delay,
                )
                await asyncio.sleep(delay)
        return ProviderResult(text=text)
