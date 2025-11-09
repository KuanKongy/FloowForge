"""Google Gemini provider (text only in v1)."""
from __future__ import annotations

import asyncio
from typing import Any

from google import genai

from ..config import get_settings
from .base import BaseProvider, ProviderResult



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

# UI labels (the strings the AIModelNode dropdown ships) -> google-genai
# model ids. Google retired ``gemini-2.0-flash`` for new users, so the
# default falls through to ``gemini-flash-latest`` which is the rolling alias
# Google maintains for the current Flash generation.
_LABEL_TO_ID: dict[str, str] = {
    "gemini": "gemini-flash-latest",
    "gemini 2.5": "gemini-2.5-flash",
    "gemini 2.5 flash": "gemini-2.5-flash",
    "gemini 2.5 pro": "gemini-2.5-pro",
    "gemini 2.0": "gemini-2.0-flash",
    "gemini 2.0 flash": "gemini-2.0-flash",
    "gemini 1.5 flash": "gemini-1.5-flash",
    "gemini 1.5 pro": "gemini-1.5-pro",
    "gemini-flash-latest": "gemini-flash-latest",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gemini-2.0-flash": "gemini-2.0-flash",
    "gemini-1.5-flash": "gemini-1.5-flash",
    "gemini-1.5-pro": "gemini-1.5-pro",
}


def _normalize_model(label: str | None, default: str = "gemini-flash-latest") -> str:
    if not label:
        return default
    key = str(label).strip().lower()
    return _LABEL_TO_ID.get(key, label)



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

class GeminiProvider(BaseProvider):
    name = "gemini"

    def __init__(self) -> None:
        self._client: genai.Client | None = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=get_settings().GEMINI_KEY)
        return self._client

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
            response = self.client.models.generate_content(model=model, contents=contents)
            return response.text or ""

        text = await asyncio.to_thread(_run)
        return ProviderResult(text=text)

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

