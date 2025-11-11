from __future__ import annotations

import pytest

from api.engine.nodes import file as file_node
from api.engine.nodes import fileparser, llm, media
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


async def test_filebox_passes_selected_file_payload_without_parsing():
    payload = {
        "kind": "file",
        "name": "notes.txt",
        "mime": "text/plain",
        "size": 12,
        "data_url": "data:text/plain;base64,aGVsbG8=",
    }

    result = await file_node.execute(
        {"id": "file", "type": "filebox", "data": {"value": payload}},
        [],
        ctx=None,
    )

    assert result == payload


async def test_filebox_uses_selected_file_when_trigger_input_is_empty():
    payload = {
        "kind": "file",
        "name": "notes.txt",
        "mime": "text/plain",
        "size": 12,
        "data_url": "data:text/plain;base64,aGVsbG8=",
    }

    result = await file_node.execute(
        {"id": "file", "type": "filebox", "data": {"value": payload}},
        [None],
        ctx=None,
    )

    assert result == payload


async def test_filebox_fails_clearly_without_selected_file():
    with pytest.raises(ValueError, match="has no selected file"):
        await file_node.execute(
            {"id": "file", "type": "filebox", "data": {}},
            [None],
            ctx=None,
        )


async def test_fileparser_fails_clearly_without_file_input():
    with pytest.raises(ValueError, match="needs a file input"):
        await fileparser.execute(
            {"id": "parser", "type": "fileparser", "data": {}},
            [None],
            ctx=None,
        )


async def test_fileparser_reads_pdf_data_url():
    import base64
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hello from PDF")
    raw = doc.write()
    payload = {
        "kind": "file",
        "name": "hello.pdf",
        "mime": "application/pdf",
        "size": len(raw),
        "data_url": f"data:application/pdf;base64,{base64.b64encode(raw).decode('ascii')}",
    }

    result = await fileparser.execute(
        {"id": "parser", "type": "fileparser", "data": {}},
        [payload],
        ctx=None,
    )

    assert "Hello from PDF" in result


async def test_fileparser_reads_text_payload():
    payload = {
        "kind": "file",
        "name": "notes.txt",
        "mime": "text/plain",
        "size": 11,
        "data_url": "data:text/plain;base64,aGVsbG8gd29ybGQ=",
    }

    result = await fileparser.execute(
        {"id": "parser", "type": "fileparser", "data": {}},
        [payload],
        ctx=None,
    )

    assert result == "hello world"


async def test_image_node_defaults_to_openai_dalle(monkeypatch):
    seen: dict[str, object] = {}

    class FakeProvider:
        async def generate(self, *, input, input_type, output_type, options):
            seen["output_type"] = output_type
            seen["model"] = options.get("model")
            return ProviderResult(blob=b"png", mime="image/png")

    def fake_get_provider(name: str):
        seen["provider"] = name
        return FakeProvider()

    monkeypatch.setattr(media, "get_provider", fake_get_provider)

    result = await media.execute(
        {"id": "img", "type": "imagegen", "data": {"prompt": "a tiny test"}},
        [],
        ctx=None,
    )

    assert result == "data:image/png;base64,cG5n"
    assert seen["provider"] == "openai"
    assert seen["output_type"] == "image"
