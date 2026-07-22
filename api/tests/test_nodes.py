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


class _FakeCtx:
    """Minimal ExecutionContext stand-in: media only reads ``run_id``."""

    run_id = "run-1"


def _stub_image_provider(monkeypatch, seen: dict, blob: bytes = b"png"):
    class FakeProvider:
        async def generate(self, *, input, input_type, output_type, options):
            seen["output_type"] = output_type
            seen["model"] = options.get("model")
            return ProviderResult(blob=blob, mime="image/png")

    def fake_get_provider(name: str):
        seen["provider"] = name
        return FakeProvider()

    monkeypatch.setattr(media, "get_provider", fake_get_provider)


async def test_image_node_uploads_to_storage_and_returns_url(monkeypatch):
    """Images must leave the worker as a short URL.

    A base64 data URL is several hundred KB, past the ~256 KB Supabase
    Realtime message limit, so the ``node_succeeded`` broadcast carrying it was
    rejected with 422 and the canvas never showed the image.
    """
    seen: dict[str, object] = {}
    _stub_image_provider(monkeypatch, seen)

    async def fake_upload(blob, mime, *, run_id, node_id):
        seen["uploaded"] = (blob, mime, run_id, node_id)
        return "https://example.supabase.co/storage/v1/object/public/run-media/x.png"

    monkeypatch.setattr(media, "upload_media", fake_upload)

    result = await media.execute(
        {"id": "img", "type": "imagegen", "data": {"prompt": "a tiny test"}},
        [],
        ctx=_FakeCtx(),
    )

    assert result == "https://example.supabase.co/storage/v1/object/public/run-media/x.png"
    assert seen["uploaded"] == (b"png", "image/png", "run-1", "img")
    assert seen["provider"] == "openai"
    assert seen["model"] is None  # provider picks its own default
    assert seen["output_type"] == "image"


async def test_image_node_inlines_small_blob_when_storage_unavailable(monkeypatch):
    """Local dev without Supabase credentials should still work for small media."""
    seen: dict[str, object] = {}
    _stub_image_provider(monkeypatch, seen)

    async def fake_upload(blob, mime, *, run_id, node_id):
        raise RuntimeError("Supabase storage is not configured")

    monkeypatch.setattr(media, "upload_media", fake_upload)

    result = await media.execute(
        {"id": "img", "type": "imagegen", "data": {"prompt": "a tiny test"}},
        [],
        ctx=_FakeCtx(),
    )
    assert result == "data:image/png;base64,cG5n"


async def test_image_node_fails_loudly_when_large_blob_cannot_be_stored(monkeypatch):
    """Never emit a payload the editor will silently drop — fail the node."""
    seen: dict[str, object] = {}
    _stub_image_provider(monkeypatch, seen, blob=b"x" * 400_000)

    async def fake_upload(blob, mime, *, run_id, node_id):
        raise RuntimeError("bucket exploded")

    monkeypatch.setattr(media, "upload_media", fake_upload)

    with pytest.raises(RuntimeError, match="could not store it"):
        await media.execute(
            {"id": "img", "type": "imagegen", "data": {"prompt": "a tiny test"}},
            [],
            ctx=_FakeCtx(),
        )
