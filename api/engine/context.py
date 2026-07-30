"""ExecutionContext: shared services for node executors during a run."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from ..db import SupabaseClient

log = logging.getLogger(__name__)


@dataclass
class ExecutionContext:
    user_id: str
    run_id: str
    flow_id: str
    flow_version_id: str
    db: SupabaseClient
    cache: dict[str, Any] = field(default_factory=dict)

    async def emit(
        self,
        kind: str,
        *,
        node_id: str | None = None,
        payload: dict[str, Any] | None = None,
        db_payload: dict[str, Any] | None = None,
    ) -> None:
        """Persist a run event and broadcast it on ``run:{run_id}``.

        - ``payload`` is what we **broadcast** to the editor over Realtime so
          live previews can show the full result (e.g. a base64 image data URL
          can be ~150 KB and we want the editor to render it immediately).
        - ``db_payload`` is what we **persist** to the ``run_events`` table.
          When omitted it falls back to ``payload``. Pass a smaller copy so
          large outputs don't bloat run history rows or the Run details modal
          when reopened later.

        ``payload.duration_ms`` (when present) is stored in the dedicated
        column so the editor's run sidebar can render per-node timing without
        re-parsing the JSON payload.

        Emission is **best-effort**: telemetry must never fail a run. A transient
        PostgREST error here used to propagate and fail the node with a
        misleading message.
        """
        from ..db import realtime_broadcast

        live_payload = payload or {}
        persisted_payload = db_payload if db_payload is not None else live_payload

        db_body: dict[str, Any] = {
            "run_id": self.run_id,
            "node_id": node_id,
            "kind": kind,
            "payload": persisted_payload,
        }
        broadcast_body: dict[str, Any] = {
            "run_id": self.run_id,
            "node_id": node_id,
            "kind": kind,
            "payload": live_payload,
        }
        duration_ms = live_payload.get("duration_ms")
        if isinstance(duration_ms, (int, float)) and duration_ms >= 0:
            db_body["duration_ms"] = int(duration_ms)
            broadcast_body["duration_ms"] = int(duration_ms)
        try:
            await self.db.insert("run_events", db_body, returning=False)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("Could not persist %s event for run %s: %s", kind, self.run_id, exc)
        try:
            await realtime_broadcast(f"run:{self.run_id}", kind, broadcast_body)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("Could not broadcast %s for run %s: %s", kind, self.run_id, exc)
