"""Shared job queue built on Redis Streams.

API servers call ``enqueue`` to push work; the worker process blocks on the
stream with ``XREADGROUP BLOCK``.  Both sides import the stream/group
constants from here so they stay in sync.
"""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

STREAM = "flowforge:jobs"
GROUP = "workers"


async def enqueue(
    r: aioredis.Redis,
    run_id: str,
    start_node_ids: list[str] | None,
) -> str:
    """Push a job to the stream. Returns the stream message ID."""
    fields: dict[str, Any] = {"run_id": run_id}
    if start_node_ids:
        fields["start_node_ids"] = json.dumps(start_node_ids)
    msg_id: bytes = await r.xadd(STREAM, fields)
    return msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
