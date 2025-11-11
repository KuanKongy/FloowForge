from __future__ import annotations

import pytest

from api.engine.nodes import llm
from api.providers.base import ProviderResult


pytestmark = pytest.mark.asyncio


async def test_llm_concatenates_multiple_text_inputs(monkeypatch):
    seen: dict[str, object] = {}

    class FakeProvider:
        async def generate(self, *, input, input_type, output_type, options):
            seen["input"] = input
            return ProviderResult(text="ok")

    monkeypatch.setattr(llm, "get_provider", lambda _name: FakeProvider())

    result = await llm.execute(
        {"id": "ai", "type": "llm", "data": {"model": "GPT-4o-mini"}},
        ["first text", "second text"],
        ctx=None,
    )

    assert result == "ok"
    assert seen["input"] == "first text\n\nsecond text"
