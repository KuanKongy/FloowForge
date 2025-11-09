"""Abstract provider. Async by design so the worker can stay non-blocking."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any



class _ProviderAccountEnvelope:
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

class ProviderResult:
    """Container for a provider response. Either text or binary."""

    __slots__ = ("text", "blob", "mime")

    def __init__(self, *, text: str | None = None, blob: bytes | None = None, mime: str | None = None):
        self.text = text
        self.blob = blob
        self.mime = mime

    def to_dict(self) -> dict[str, Any]:
        if self.text is not None:
            return {"kind": "text", "value": self.text}
        return {"kind": "blob", "mime": self.mime, "bytes_len": len(self.blob or b"")}



def _collect_provider_edge_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_provider_edge_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

class BaseProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def generate(
        self,
        *,
        input: Any,
        input_type: str,
        output_type: str,
        options: dict[str, Any],
    ) -> ProviderResult:
        ...

def _merge_provider_schema_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_provider_schema_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

