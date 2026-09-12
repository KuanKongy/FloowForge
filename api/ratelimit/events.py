"""Client-signal capture for abuse forensics.

Each interesting request is recorded with the signals the rate limiter keys
on — IP, device fingerprint, OS/browser (parsed from the user agent),
timezone, language — buffered in a capped Redis list and flushed in batches
to the ``client_events`` table (service-role only; see migration
0004_client_events.sql, retained 90 days).

What gets persisted (mirrors the Privacy Policy): every 401/403/429, every
mutation, every public trigger hit, and a small sample of reads. When Redis
is down events are dropped — enforcement matters, forensics is best-effort.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import re
from datetime import UTC, datetime
from typing import Any

from .. import db as _db
from ..config import get_settings

log = logging.getLogger(__name__)

QUEUE_KEY = "flowforge:client_events"
QUEUE_MAX = 50_000
FLUSH_BATCH = 500
FLUSH_INTERVAL_S = 30.0

_ALWAYS_LOG_STATUS = {401, 403, 429}
_MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Order matters: the first match wins (Edge and Opera embed "Chrome/",
# Chrome embeds "Safari/").
_BROWSERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Edge", re.compile(r"Edg(?:e|A|iOS)?/")),
    ("Opera", re.compile(r"(?:OPR|Opera)/")),
    ("Samsung Internet", re.compile(r"SamsungBrowser/")),
    ("Chrome", re.compile(r"(?:Chrome|CriOS)/")),
    ("Firefox", re.compile(r"(?:Firefox|FxiOS)/")),
    ("Safari", re.compile(r"Version/[\d.]+.*Safari/")),
    ("curl", re.compile(r"^curl/")),
    ("httpx", re.compile(r"^python-httpx/")),
    ("requests", re.compile(r"^python-requests/")),
    ("Postman", re.compile(r"^PostmanRuntime/")),
)

_OSES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Windows", re.compile(r"Windows NT")),
    ("iOS", re.compile(r"(?:iPhone|iPad|iPod)")),
    ("macOS", re.compile(r"(?:Mac OS X|Macintosh)")),
    ("ChromeOS", re.compile(r"CrOS")),
    ("Android", re.compile(r"Android")),
    ("Linux", re.compile(r"Linux")),
)


def parse_user_agent(ua: str | None) -> tuple[str, str]:
    """(browser, os) — coarse buckets are enough for forensics."""
    if not ua:
        return ("Unknown", "Unknown")
    browser = next((name for name, rx in _BROWSERS if rx.search(ua)), "Other")
    os_name = next((name for name, rx in _OSES if rx.search(ua)), "Other")
    return (browser, os_name)


def should_log(
    method: str,
    status: int,
    path: str,
    *,
    sample_rate: float,
    rand: float | None = None,
) -> bool:
    if status in _ALWAYS_LOG_STATUS:
        return True
    if method in _MUTATING_METHODS:
        return True
    if path.startswith("/t/"):
        return True
    return (random.random() if rand is None else rand) < sample_rate


def build_event(
    *,
    method: str,
    path: str,
    status: int,
    user_id: str | None,
    ip: str,
    fingerprint: str | None,
    user_agent: str | None,
    lang: str | None,
    tz: str | None,
) -> dict[str, Any]:
    browser, os_name = parse_user_agent(user_agent)
    return {
        "ts": datetime.now(UTC).isoformat(),
        "method": method,
        "path": path,
        "status": status,
        "user_id": user_id,
        "ip": ip,
        "fingerprint": fingerprint,
        "ua_browser": browser,
        "ua_os": os_name,
        "user_agent": (user_agent or "")[:512] or None,
        "lang": (lang or "").split(",")[0].strip()[:35] or None,
        "tz": (tz or "").strip()[:64] or None,
    }


async def record_event(redis, event: dict[str, Any]) -> None:
    if redis is None:
        return
    try:
        pipe = redis.pipeline(transaction=False)
        pipe.lpush(QUEUE_KEY, json.dumps(event, separators=(",", ":")))
        pipe.ltrim(QUEUE_KEY, 0, QUEUE_MAX - 1)
        await pipe.execute()
    except Exception as exc:  # pragma: no cover
        log.debug("Client event dropped (Redis unavailable): %s", exc)


async def flush_once(redis) -> int:
    """Drain up to FLUSH_BATCH queued events into Postgres. Returns row count."""
    if redis is None:
        return 0
    try:
        raw = await redis.rpop(QUEUE_KEY, FLUSH_BATCH)
    except Exception as exc:  # pragma: no cover
        log.debug("Client event flush read failed: %s", exc)
        return 0
    if not raw:
        return 0
    if not isinstance(raw, list):
        raw = [raw]
    rows: list[dict[str, Any]] = []
    for item in raw:
        try:
            rows.append(json.loads(item))
        except (TypeError, ValueError):
            continue
    if not rows:
        return 0
    try:
        await _db.SupabaseClient.as_service().insert("client_events", rows, returning=False)
        return len(rows)
    except Exception as exc:
        # Dropped, not requeued: a schema problem would otherwise loop forever.
        log.warning("Failed to persist %d client events: %s", len(rows), exc)
        return 0


async def flush_loop(app) -> None:
    """Lifespan task: periodically persist buffered client events."""
    while True:
        await asyncio.sleep(FLUSH_INTERVAL_S)
        settings = get_settings()
        if not settings.CLIENT_EVENTS_ENABLED:
            continue
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            continue
        with contextlib.suppress(Exception):
            await flush_once(app.state.redis)
