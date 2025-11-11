"""Redis Streams blocking worker.

Run with::

    python -m api.worker

The worker blocks on ``XREADGROUP BLOCK`` so it issues ~120 Redis commands per
hour when idle (vs arq's ~7200).  On crash, pending messages are recovered via
``XAUTOCLAIM`` on the next startup.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from typing import Any

import redis.asyncio as aioredis
from redis.exceptions import ResponseError

from .config import get_settings
from .queue import STREAM, GROUP

log = logging.getLogger("flowforge.worker")

MAX_RETRIES = 3
BLOCK_MS = 30_000
AUTOCLAIM_MIN_IDLE_MS = 5 * 60 * 1000  # 5 min
TRIM_INTERVAL = 100  # trim stream every N processed messages
CONSUMER = f"worker-{os.getpid()}"

_shutdown = False


def _handle_signal(sig: int, _frame: Any) -> None:
    global _shutdown
    log.info("Received signal %s, shutting down after current job…", sig)
    _shutdown = True


async def _ensure_group(r: aioredis.Redis) -> None:
    try:
        await r.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
        log.info("Created consumer group %s on %s", GROUP, STREAM)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _recover_pending(r: aioredis.Redis, retry_counts: dict[str, int]) -> list[tuple[bytes, dict]]:
    """Reclaim messages idle for longer than AUTOCLAIM_MIN_IDLE_MS."""
    reclaimed: list[tuple[bytes, dict]] = []
    start_id = b"0-0"
    while True:
        result = await r.xautoclaim(
            STREAM, GROUP, CONSUMER, min_idle_time=AUTOCLAIM_MIN_IDLE_MS, start_id=start_id, count=10,
        )
        # xautoclaim returns (next_start_id, [(id, fields), ...], deleted_ids)
        next_start, messages, _deleted = result
        if not messages:
            break
        for msg_id, fields in messages:
            if fields is None:
                continue
            key = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
            retry_counts[key] = retry_counts.get(key, 0) + 1
            reclaimed.append((msg_id, fields))
        if next_start == b"0-0" or next_start == start_id:
            break
        start_id = next_start
    return reclaimed


async def _dead_letter(r: aioredis.Redis, msg_id: bytes, run_id: str) -> None:
    """ACK a poison message and mark its run as failed."""
    log.error("Dead-lettering message %s (run %s) after %d retries", msg_id, run_id, MAX_RETRIES)
    try:
        from .db import SupabaseClient
        import datetime as _dt
        sc = SupabaseClient.as_service()
        await sc.update(
            "runs",
            {
                "status": "failed",
                "ended_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
                "error": f"Exceeded {MAX_RETRIES} retries; moved to dead letter",
            },
            params={"id": f"eq.{run_id}"},
            returning=False,
        )
    except Exception:
        log.exception("Failed to mark run %s as dead-lettered", run_id)
    await r.xack(STREAM, GROUP, msg_id)
    await r.xdel(STREAM, msg_id)


async def _process_message(msg_id: bytes, fields: dict, r: aioredis.Redis) -> None:
    run_id = _field(fields, "run_id")
    raw_start = _field(fields, "start_node_ids")
    start_node_ids: list[str] | None = json.loads(raw_start) if raw_start else None

    log.info("Processing run %s (msg %s)", run_id, msg_id)
    from .engine.executor import run_flow
    t0 = time.monotonic()
    try:
        result = await run_flow(run_id, start_node_ids)
        elapsed = time.monotonic() - t0
        log.info("Run %s completed in %.1fs: %s", run_id, elapsed, result.get("ok"))
    except Exception:
        elapsed = time.monotonic() - t0
        log.exception("Run %s failed after %.1fs", run_id, elapsed)

    await r.xack(STREAM, GROUP, msg_id)
    await r.xdel(STREAM, msg_id)


def _field(fields: dict, key: str) -> str | None:
    v = fields.get(key) or fields.get(key.encode())
    if isinstance(v, bytes):
        return v.decode()
    return v


async def _main_loop() -> None:
    settings = get_settings()
    backoff = 1.0
    processed = 0

    while not _shutdown:
        r: aioredis.Redis | None = None
        try:
            r = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=False,
                socket_connect_timeout=10,
                socket_timeout=60,
            )
            await _ensure_group(r)
            backoff = 1.0
            log.info("Connected to Redis, consumer=%s", CONSUMER)

            retry_counts: dict[str, int] = {}

            # Recover any pending messages from previous crashes
            reclaimed = await _recover_pending(r, retry_counts)
            for msg_id, fields in reclaimed:
                if _shutdown:
                    break
                key = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
                run_id = _field(fields, "run_id") or "unknown"
                if retry_counts.get(key, 0) > MAX_RETRIES:
                    await _dead_letter(r, msg_id, run_id)
                    continue
                log.info("Retrying recovered message %s (run %s, attempt %d)", key, run_id, retry_counts[key])
                await _process_message(msg_id, fields, r)
                processed += 1

            # Main blocking read loop
            while not _shutdown:
                result = await r.xreadgroup(
                    GROUP, CONSUMER, {STREAM: ">"}, count=1, block=BLOCK_MS,
                )
                if not result:
                    continue
                for _stream_name, messages in result:
                    for msg_id, fields in messages:
                        if fields is None:
                            await r.xack(STREAM, GROUP, msg_id)
                            continue
                        await _process_message(msg_id, fields, r)
                        processed += 1
                        if processed % TRIM_INTERVAL == 0:
                            await r.xtrim(STREAM, maxlen=1000, approximate=True)

        except (OSError, ConnectionError, TimeoutError) as exc:
            log.warning("Redis connection lost (%s), reconnecting in %.0fs…", exc, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)
        except Exception:
            log.exception("Unexpected error in worker loop")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)
        finally:
            if r is not None:
                await r.aclose()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    log.info("FlowForge worker starting (PID %d)", os.getpid())
    asyncio.run(_main_loop())
    log.info("Worker shut down cleanly")


if __name__ == "__main__":
    main()
