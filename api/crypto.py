"""Encryption for provider credentials stored in `integrations`.

The column is named ``encrypted_credentials`` but historically held plain
``json.dumps`` output, so anyone who reached the database — including through the
prompt-template sandbox escape — read every tenant's provider API keys.

Values are encrypted with AES-256-GCM under ``CREDENTIALS_KEY`` and stored as::

    enc:v1:<base64url(nonce || ciphertext || tag)>

Reads transparently accept the legacy plaintext JSON form so existing rows keep
working until they are rewritten; :func:`is_encrypted` lets a backfill find them.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

log = logging.getLogger(__name__)

_PREFIX = "enc:v1:"
_NONCE_BYTES = 12


class CredentialsKeyMissing(RuntimeError):
    """Raised when encryption is requested but no key is configured."""


def _key() -> bytes:
    """Derive a 32-byte AES key from the configured secret."""
    raw = get_settings().CREDENTIALS_KEY
    if not raw:
        raise CredentialsKeyMissing(
            "CREDENTIALS_KEY is not set; cannot store provider credentials securely."
        )
    return hashlib.sha256(raw.encode()).digest()


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_PREFIX)


def encrypt_credentials(credentials: dict[str, Any]) -> str:
    """Encrypt a credentials mapping for storage."""
    plaintext = json.dumps(credentials).encode()
    nonce = os.urandom(_NONCE_BYTES)
    blob = nonce + AESGCM(_key()).encrypt(nonce, plaintext, None)
    return _PREFIX + base64.urlsafe_b64encode(blob).decode()


def decrypt_credentials(stored: str | None) -> dict[str, Any]:
    """Decrypt a stored value, tolerating legacy plaintext rows."""
    if not stored:
        return {}
    if not is_encrypted(stored):
        # Legacy plaintext row written before encryption existed.
        try:
            loaded = json.loads(stored)
            return loaded if isinstance(loaded, dict) else {}
        except (ValueError, TypeError):
            log.warning("Ignoring malformed credentials blob")
            return {}
    raw = base64.urlsafe_b64decode(stored[len(_PREFIX):].encode())
    nonce, ciphertext = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
    plaintext = AESGCM(_key()).decrypt(nonce, ciphertext, None)
    loaded = json.loads(plaintext.decode())
    return loaded if isinstance(loaded, dict) else {}
