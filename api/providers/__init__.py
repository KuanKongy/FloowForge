"""Provider registry. Singletons since clients are stateless after construction."""
from __future__ import annotations

from .base import BaseProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .cloudflare_provider import CloudflareProvider



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

_PROVIDERS: dict[str, BaseProvider] | None = None



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

def get_provider(name: str) -> BaseProvider | None:
    global _PROVIDERS
    if _PROVIDERS is None:
        _PROVIDERS = {
            "openai": OpenAIProvider(),
            "gemini": GeminiProvider(),
            "cloudflare": CloudflareProvider(),
        }
    return _PROVIDERS.get(name)


PROVIDER_NAMES = ("openai", "gemini", "cloudflare")

def _shape_provider_media_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_provider_media_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_provider_media_row(row) for row in rows]

