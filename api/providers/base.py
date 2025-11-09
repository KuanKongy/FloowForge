"""Abstract provider. Async by design so the worker can stay non-blocking."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


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
