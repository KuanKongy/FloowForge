"""Composite rate limiting: sliding windows, identity precedence, penalties.

Submodules:
- ``core``         — the sliding-window engine (Redis sorted sets, in-memory fallback)
- ``identity``     — request identity: user > device fingerprint > client IP
- ``policies``     — the route-class limit table
- ``penalties``    — progressive temp blocks for repeat violators
- ``authcache``    — short-TTL token -> user_id cache shared with ``api.deps``
- ``middleware``   — global IP pre-check + default limit + response headers
- ``events``       — client-signal capture (IP, fingerprint, OS, browser, tz, lang)
- ``dependencies`` — per-route FastAPI dependencies (imported via ``api.utils.rate_limit``)

``dependencies`` is intentionally not imported here: it depends on ``api.deps``,
which itself imports ``authcache`` from this package, and importing it at
package-import time would create a cycle.
"""
from .core import Decision, evaluate_window, sliding_window_check
from .identity import Identity, client_ip, fingerprint_from_header, identify
from .policies import Policy

__all__ = [
    "Decision",
    "evaluate_window",
    "sliding_window_check",
    "Identity",
    "client_ip",
    "fingerprint_from_header",
    "identify",
    "Policy",
]
