"""Incoming and outgoing webhook signing.

Every webhook trigger already mints a ``secret`` alongside its URL token. Until
now nothing ever read it: the token in the URL path was the only credential, and
tokens leak through proxy logs, browser history, and ``Referer`` headers.

Both directions use HMAC-SHA256 over the raw request body:

- **Incoming** — callers send ``X-FloowForge-Signature: sha256=<hex>``. Verified
  with :func:`hmac.compare_digest`.
- **Outgoing** — callbacks we POST carry the same header so the receiver can
  authenticate us.

A replay window is enforced via ``X-FloowForge-Timestamp`` when present.
"""
from __future__ import annotations

import hashlib
import hmac
import time

SIGNATURE_HEADER = "X-FloowForge-Signature"
TIMESTAMP_HEADER = "X-FloowForge-Timestamp"
_PREFIX = "sha256="

# How far a signed timestamp may drift before we treat it as a replay.
MAX_TIMESTAMP_SKEW_SECONDS = 300


def sign_payload(secret: str, body: bytes, timestamp: str | None = None) -> str:
    """Return the ``sha256=<hex>`` signature for ``body``.

    When ``timestamp`` is supplied it is bound into the signature as
    ``<timestamp>.<body>`` so a captured request cannot be replayed later.
    """
    mac_body = f"{timestamp}.".encode() + body if timestamp else body
    digest = hmac.new(secret.encode(), mac_body, hashlib.sha256).hexdigest()
    return f"{_PREFIX}{digest}"


def verify_webhook_signature(
    secret: str | None,
    body: bytes,
    signature: str | None,
    timestamp: str | None = None,
) -> tuple[bool, str]:
    """Verify an incoming signature.

    Returns ``(ok, reason)``. ``reason`` is empty when ``ok`` is true.
    """
    if not secret:
        # No secret stored (legacy trigger): nothing to verify against.
        return True, ""
    if not signature:
        return False, "Missing signature header"

    if timestamp:
        try:
            drift = abs(time.time() - float(timestamp))
        except (TypeError, ValueError):
            return False, "Malformed timestamp header"
        if drift > MAX_TIMESTAMP_SKEW_SECONDS:
            return False, "Signature timestamp outside the accepted window"

    expected = sign_payload(secret, body, timestamp)
    # Accept a bare hex digest as well as the prefixed form.
    candidates = (expected, expected[len(_PREFIX):])
    if any(hmac.compare_digest(signature, c) for c in candidates):
        return True, ""
    return False, "Signature mismatch"
