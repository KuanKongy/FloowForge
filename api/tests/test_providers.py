"""Provider HTTP contract tests.

These tests patch the HTTP client used by each provider to assert request
shape and result mapping without hitting any real APIs. We avoid respx for
the Cloudflare provider because the Workers AI model path contains an ``@`` (e.g.
``@cf/lykon/dreamshaper-8-lcm``), which respx's URL matcher mis-parses as
user-info.
"""
from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import patch
from typing import Any

import httpx
import pytest

from api.providers.cloudflare_provider import CloudflareProvider
from api.providers.gemini_provider import _to_gemini_contents


def _settings_patch(**overrides):
    """Patch ``get_settings`` everywhere it was imported.

    Each provider module did ``from ..config import get_settings``, so the
    function is bound in their namespaces and patching only ``api.config``
    misses them. We patch all known sites via an ExitStack-style context.
    """
    from api import config as config_module

    base = {
        "OPENAI_API_KEY": "test-key",
        "CLOUDFLARE_ID": "acct",
        "CLOUDFLARE_KEY": "cf-key",
        "GEMINI_KEY": "gem-key",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_ANON_KEY": "anon",
        "SUPABASE_SERVICE_ROLE_KEY": "service",
        "REDIS_URL": "redis://localhost",
        "WEB_ORIGIN": "http://localhost:3000",
        "PUBLIC_API_URL": "http://localhost:5001",
    }
    base.update(overrides)
    settings = config_module.Settings(**base)

    class _MultiPatch:
        def __enter__(self):
            self._stack = ExitStack()
            self._stack.__enter__()
            self._stack.enter_context(patch.object(config_module, "get_settings", return_value=settings))
            from api.providers import cloudflare_provider, openai_provider, gemini_provider
            from api import db as api_db

            for module in (cloudflare_provider, openai_provider, gemini_provider, api_db):
                self._stack.enter_context(
                    patch.object(module, "get_settings", return_value=settings)
                )
            return settings

        def __exit__(self, *exc):
            return self._stack.__exit__(*exc)

    return _MultiPatch()


# ---------------------------------------------------------------------------
# Cloudflare provider
# ---------------------------------------------------------------------------


def _stub_async_client(send_response):
    """Replace ``httpx.AsyncClient`` with a stub that records the request and
    yields ``send_response(request) -> httpx.Response`` for every call.

    Returned context manager exposes ``calls`` (list of httpx.Request).
    """

    calls: list[httpx.Request] = []

    class _StubClient:
        def __init__(self, *_, **__):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def post(self, url, *, headers=None, json=None, content=None, **_):
            req = httpx.Request("POST", url, headers=headers, json=json, content=content)
            calls.append(req)
            return send_response(req)

        async def get(self, url, *, headers=None, params=None, **_):
            req = httpx.Request("GET", url, headers=headers, params=params)
            calls.append(req)
            return send_response(req)

    @pytest.fixture
    def _noop():  # pragma: no cover
        yield

    class _Ctx:
        def __init__(self):
            self.calls = calls

        def __enter__(self):
            self._patch = patch.object(httpx, "AsyncClient", _StubClient)
            self._patch.__enter__()
            return self

        def __exit__(self, *exc):
            return self._patch.__exit__(*exc)

    return _Ctx()


@pytest.mark.asyncio
async def test_cloudflare_text_maps_response_field():
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"result": {"response": "hello world"}}, request=req)

    with _settings_patch(), _stub_async_client(respond) as stub:
        result = await provider.generate(
            input="hi",
            input_type="text",
            output_type="text",
            options={"temperature": 0.5},
        )
        assert result.text == "hello world"
        assert stub.calls
        body = _read_request_body(stub.calls[-1])
        assert body["messages"][-1] == {"role": "user", "content": "hi"}
        # 0.5 (UI) maps to 1.0 (CF / OpenAI scale).
        assert body["temperature"] == 1.0


@pytest.mark.asyncio
async def test_cloudflare_image_decodes_base64():
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"result": {"image": "aGVsbG8="}},  # b64("hello")
            headers={"content-type": "application/json"},
            request=req,
        )

    with _settings_patch(), _stub_async_client(respond):
        result = await provider.generate(
            input="cat",
            input_type="text",
            output_type="image",
            options={},
        )
        assert result.blob == b"hello"
        assert result.mime == "image/png"


@pytest.mark.asyncio
async def test_cloudflare_normalizes_ui_label_for_text():
    """The UI dropdown ships labels like ``"Llama 3 (Cloudflare)"`` which are
    NOT valid Workers AI model ids. The provider must rewrite them before
    concatenating into the Workers AI URL; otherwise CF responds with 401, which
    is exactly the failure the user hit on run b676bf0a.
    """
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"result": {"response": "ok"}}, request=req)

    with _settings_patch(), _stub_async_client(respond) as stub:
        await provider.generate(
            input="hi",
            input_type="text",
            output_type="text",
            options={"model": "Llama 3 (Cloudflare)"},
        )
    assert stub.calls
    url = str(stub.calls[-1].url)
    assert "@cf/meta/llama-3-8b-instruct" in url
    # The literal UI label must NOT have been concatenated.
    assert "Llama" not in url


@pytest.mark.asyncio
async def test_cloudflare_normalizes_ui_label_for_image():
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"result": {"image": "aGVsbG8="}},
            headers={"content-type": "application/json"},
            request=req,
        )

    with _settings_patch(), _stub_async_client(respond) as stub:
        await provider.generate(
            input="cat",
            input_type="text",
            output_type="image",
            options={"model": "DreamShaper"},
        )
    url = str(stub.calls[-1].url)
    assert "@cf/lykon/dreamshaper-8-lcm" in url


@pytest.mark.asyncio
async def test_cloudflare_401_error_points_user_at_account_setup():
    """A 401 from Workers AI typically means the model isn't enabled on
    the user's Cloudflare account, not that the API key is wrong. The
    provider should surface that in the exception message so the run
    sidebar can show actionable guidance.
    """
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "Unauthorized"}, request=req)

    with _settings_patch(), _stub_async_client(respond):
        try:
            await provider.generate(
                input="cat",
                input_type="text",
                output_type="image",
                options={"model": "DreamShaper"},
            )
            raise AssertionError("Expected HTTPStatusError")
        except httpx.HTTPStatusError as exc:
            msg = str(exc)
            assert "401" in msg
            # The hint must reference an actual recovery action.
            assert "Workers AI" in msg
            assert "Read + Write" in msg


@pytest.mark.asyncio
async def test_cloudflare_image_falls_back_to_raw_bytes():
    provider = CloudflareProvider()

    def respond(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"\x89PNGRAW",
            headers={"content-type": "image/png"},
            request=req,
        )

    with _settings_patch(), _stub_async_client(respond):
        result = await provider.generate(
            input="cat",
            input_type="text",
            output_type="image",
            options={},
        )
        assert result.blob == b"\x89PNGRAW"


def _read_request_body(req: httpx.Request) -> dict[str, Any]:
    import json as _json

    return _json.loads(req.content)


# ---------------------------------------------------------------------------
# Gemini provider (just the contents mapper; HTTP is in google-genai).
# ---------------------------------------------------------------------------


def test_gemini_normalizes_ui_label():
    """The UI dropdown ships a friendly label ``"Gemini"``; the provider
    must rewrite it to a canonical SDK model id, otherwise the API replies
    with ``GenerateContentRequest.model: unexpected model name format``.
    """
    from api.providers.gemini_provider import _normalize_model

    assert _normalize_model("Gemini") == "gemini-flash-latest"
    assert _normalize_model("Gemini 2.5 Flash") == "gemini-2.5-flash"
    assert _normalize_model("Gemini 2.5 Flash Lite") == "gemini-2.5-flash-lite"
    assert _normalize_model("Gemini 1.5 Flash") == "gemini-2.5-flash-lite"
    assert _normalize_model("gemini-2.0-flash") == "gemini-2.0-flash"
    # Unknown labels are passed through verbatim so users can opt into
    # newer model ids without needing a code change.
    assert _normalize_model("gemini-3.0-flash") == "gemini-3.0-flash"
    assert _normalize_model(None) == "gemini-flash-latest"


def test_gemini_string_input_becomes_user_message():
    contents = _to_gemini_contents("hello", None)
    assert contents == ["hello"]


def test_gemini_chat_list_maps_to_role_parts():
    msgs = [
        {"role": "system", "content": "be nice"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "yo"},
    ]
    contents = _to_gemini_contents(msgs, None)
    # System collapses to user; assistant -> model.
    assert contents == [
        {"role": "user", "parts": [{"text": "be nice"}]},
        {"role": "user", "parts": [{"text": "hi"}]},
        {"role": "model", "parts": [{"text": "yo"}]},
    ]


def test_gemini_empty_input_uses_prompt_fallback():
    contents = _to_gemini_contents("", "fallback prompt")
    assert contents == ["fallback prompt"]


# ---------------------------------------------------------------------------
# OpenAI provider (we test message construction without an SDK call).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_openai_uses_options_prompt_when_input_empty():
    """When the upstream pipeline value is empty, the provider should use the
    node's `options.prompt` (mirrors the editor's UI behavior).
    """
    from api.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider()

    # We replace the chat.completions.create coroutine with a stub that records
    # the params it would send.
    captured: dict = {}

    class _Choice:
        def __init__(self):
            self.message = type("M", (), {"content": "ok"})()

    class _Completion:
        def __init__(self):
            self.choices = [_Choice()]

    async def _create(**params):
        captured.update(params)
        return _Completion()

    class _Chat:
        def __init__(self):
            self.completions = type("C", (), {"create": staticmethod(_create)})()

    class _Client:
        def __init__(self):
            self.chat = _Chat()

    provider._client = _Client()
    with _settings_patch():
        result = await provider.generate(
            input="",
            input_type="text",
            output_type="text",
            options={"prompt": "Write a haiku", "temperature": 0.5},
        )
    assert result.text == "ok"
    assert captured["messages"][-1]["content"] == "Write a haiku"
    # 0.5 (UI) -> 1.0 (OpenAI scale 0..2).
    assert captured["temperature"] == 1.0
