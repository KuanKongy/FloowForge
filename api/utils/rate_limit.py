"""Compatibility shim — the implementation lives in ``api.ratelimit``.

Kept so existing imports (`from ..utils.rate_limit import rate_limit`)
continue to work; new code should import from ``api.ratelimit.dependencies``.
"""
from __future__ import annotations

from ..ratelimit.dependencies import public_rate_limit, rate_limit

__all__ = ["rate_limit", "public_rate_limit"]
