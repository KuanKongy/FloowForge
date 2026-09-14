"""Regression tests for the findings in docs/AUDIT.md.

Each test names the audit ID it locks down. They are written so that reverting
the corresponding fix makes the test fail.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# S1 — prompt templates must not reach the Python interpreter
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        "{{ ''.__class__.__mro__[1].__subclasses__() }}",
        "{{ cycler.__init__.__globals__ }}",
        "{{ self.__init__.__globals__ }}",
        "{{ ''.__class__.__base__ }}",
        "{{ lipsum.__globals__['os'].popen('id').read() }}",
    ],
)
def test_prompt_template_blocks_sandbox_escapes(payload):
    """S1: a user-authored prompt body must not execute Python in the worker."""
    from jinja2.exceptions import SecurityError, UndefinedError

    from api.engine.nodes.prompt_template import _jinja

    with pytest.raises((SecurityError, UndefinedError)):
        _jinja.from_string(payload).render()


def test_prompt_template_still_renders_normal_templates():
    """S1: sandboxing must not break ordinary prompt authoring."""
    from api.engine.nodes.prompt_template import _jinja

    rendered = _jinja.from_string(
        "Summarise {{ topic }} in {{ n }} points:\n{% for i in range(n) %}- item {{ i }}\n{% endfor %}"
    ).render(topic="otters", n=2)
    assert "otters" in rendered
    assert "- item 0" in rendered
    assert "- item 1" in rendered


# ---------------------------------------------------------------------------
# S6 — outbound callbacks must not reach internal networks
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://127.0.0.1:5001/internal",
        "http://localhost/admin",
        "http://[::1]/admin",
        "http://10.0.0.5/hook",
        "http://192.168.1.10/hook",
        "file:///etc/passwd",
        "gopher://example.com/",
    ],
)
def test_callback_url_rejects_internal_targets(url):
    """S6: callback_url is user-supplied and must not be an SSRF primitive."""
    from api.utils.ssrf import UnsafeCallbackURL, assert_safe_callback_url

    with pytest.raises(UnsafeCallbackURL):
        assert_safe_callback_url(url, allow_private=False)


def test_callback_url_allows_public_https():
    from api.utils.ssrf import assert_safe_callback_url

    assert_safe_callback_url("https://example.com/hooks/floowforge", allow_private=False)


def test_callback_url_allows_localhost_in_dev():
    """Local development legitimately points callbacks at localhost."""
    from api.utils.ssrf import assert_safe_callback_url

    assert_safe_callback_url("http://localhost:9999/hook", allow_private=True)


# ---------------------------------------------------------------------------
# S7 — webhook signature verification
# ---------------------------------------------------------------------------


def test_webhook_signature_roundtrip():
    """S7: a correctly signed body verifies."""
    import time

    from api.webhooks import sign_payload, verify_webhook_signature

    body = b'{"hello":"world"}'
    now = str(int(time.time()))
    sig = sign_payload("s3cret", body, now)
    ok, reason = verify_webhook_signature("s3cret", body, sig, now)
    assert ok, reason


def test_webhook_signature_rejects_future_timestamp():
    """A far-future timestamp is as suspect as a stale one."""
    from api.webhooks import sign_payload, verify_webhook_signature

    future = "1900000000"  # year 2030
    sig = sign_payload("s3cret", b"{}", future)
    ok, reason = verify_webhook_signature("s3cret", b"{}", sig, future)
    assert not ok
    assert "window" in reason


def test_webhook_signature_rejects_tampered_body():
    from api.webhooks import sign_payload, verify_webhook_signature

    sig = sign_payload("s3cret", b'{"amount":1}', None)
    ok, _ = verify_webhook_signature("s3cret", b'{"amount":9999}', sig, None)
    assert not ok


def test_webhook_signature_rejects_wrong_secret():
    from api.webhooks import sign_payload, verify_webhook_signature

    sig = sign_payload("attacker-secret", b"{}", None)
    ok, _ = verify_webhook_signature("real-secret", b"{}", sig, None)
    assert not ok


def test_webhook_signature_requires_header_when_secret_present():
    from api.webhooks import verify_webhook_signature

    ok, reason = verify_webhook_signature("s3cret", b"{}", None, None)
    assert not ok
    assert "Missing signature" in reason


def test_webhook_signature_rejects_stale_timestamp():
    """S7: an old signed request must not be replayable."""
    from api.webhooks import sign_payload, verify_webhook_signature

    stale = "1000000000"  # 2001
    sig = sign_payload("s3cret", b"{}", stale)
    ok, reason = verify_webhook_signature("s3cret", b"{}", sig, stale)
    assert not ok
    assert "window" in reason


# ---------------------------------------------------------------------------
# S8 — provider credentials encrypted at rest
# ---------------------------------------------------------------------------


def test_credentials_encrypt_roundtrip():
    """S8: credentials must not be recoverable from the stored string."""
    from api.crypto import decrypt_credentials, encrypt_credentials, is_encrypted

    secret = {"api_key": "sk-super-secret-value"}
    stored = encrypt_credentials(secret)

    assert is_encrypted(stored)
    assert "sk-super-secret-value" not in stored
    assert decrypt_credentials(stored) == secret


def test_credentials_encryption_is_randomised():
    """Same plaintext must not produce the same ciphertext (fresh nonce)."""
    from api.crypto import encrypt_credentials

    a = encrypt_credentials({"api_key": "same"})
    b = encrypt_credentials({"api_key": "same"})
    assert a != b


def test_credentials_reads_legacy_plaintext_rows():
    """Existing plaintext rows must keep working until they are rewritten."""
    import json

    from api.crypto import decrypt_credentials, is_encrypted

    legacy = json.dumps({"api_key": "sk-legacy"})
    assert not is_encrypted(legacy)
    assert decrypt_credentials(legacy) == {"api_key": "sk-legacy"}


# ---------------------------------------------------------------------------
# S12 — CORS origins come from settings, not a hardcoded localhost
# ---------------------------------------------------------------------------


def test_cors_origins_exclude_localhost_in_production(monkeypatch):
    """S12: production must not trust http://localhost:3000."""
    from api import config as config_module

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_ORIGIN", "https://app.example.com")
    config_module.get_settings.cache_clear()
    try:
        origins = config_module.get_settings().cors_origins
        assert origins == ["https://app.example.com"]
        assert "http://localhost:3000" not in origins
    finally:
        config_module.get_settings.cache_clear()


def test_cors_origins_never_contain_empty_string(monkeypatch):
    """An unset WEB_ORIGIN used to inject an empty origin into the allowlist."""
    from api import config as config_module

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("WEB_ORIGIN", "")
    config_module.get_settings.cache_clear()
    try:
        assert config_module.get_settings().cors_origins == []
    finally:
        config_module.get_settings.cache_clear()


# ---------------------------------------------------------------------------
# E13 — schedule configs validated before the trigger row is written
# ---------------------------------------------------------------------------


def test_schedule_validation_rejects_bad_cron():
    from api.scheduler import validate_schedule_config

    with pytest.raises(ValueError):
        validate_schedule_config({"schedule_mode": "cron", "cron": "not a cron"})


def test_schedule_validation_enforces_minimum_interval():
    """E13: `interval_seconds: 1` would hammer the queue."""
    from api.scheduler import validate_schedule_config

    with pytest.raises(ValueError, match="at least"):
        validate_schedule_config({"schedule_mode": "interval", "interval_seconds": 1})


def test_schedule_validation_accepts_valid_cron():
    from api.scheduler import validate_schedule_config

    validate_schedule_config({"schedule_mode": "cron", "cron": "0 9 * * 1"})


def test_once_at_preserves_explicit_offset():
    """E13: `.replace(tzinfo=tz)` silently moved `...Z` times by the tz offset."""
    import datetime as dt
    import zoneinfo

    from api.scheduler import _parse_once_at

    tokyo = zoneinfo.ZoneInfo("Asia/Tokyo")
    parsed = _parse_once_at("2026-01-01T00:00:00Z", tokyo)
    assert parsed.utcoffset() == dt.timedelta(0)

    naive = _parse_once_at("2026-01-01T00:00:00", tokyo)
    assert naive.utcoffset() == dt.timedelta(hours=9)
