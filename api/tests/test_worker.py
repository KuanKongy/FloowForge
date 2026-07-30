"""Worker delivery-semantics tests (audit E4).

The worker had no test coverage at all, which is why it could acknowledge failed
jobs and why its dead-letter path was unreachable.
"""
from __future__ import annotations

from typing import Any

import pytest

from api import worker

pytestmark = pytest.mark.asyncio


class FakeRedis:
    """Records the stream operations the worker performs."""

    def __init__(self) -> None:
        self.acked: list[bytes] = []
        self.deleted: list[bytes] = []
        self.hash: dict[str, int] = {}

    async def xack(self, stream: str, group: str, msg_id: bytes) -> None:
        self.acked.append(msg_id)

    async def xdel(self, stream: str, msg_id: bytes) -> None:
        self.deleted.append(msg_id)

    async def hget(self, name: str, key: str) -> bytes | None:
        value = self.hash.get(key)
        return str(value).encode() if value is not None else None

    async def hincrby(self, name: str, key: str, amount: int) -> int:
        self.hash[key] = self.hash.get(key, 0) + amount
        return self.hash[key]

    async def hdel(self, name: str, key: str) -> None:
        self.hash.pop(key, None)

    async def expire(self, name: str, ttl: int) -> None:
        return None


async def test_failed_run_is_not_acknowledged(monkeypatch):
    """E4: acking a crashed job meant it was never retried."""
    r = FakeRedis()

    async def boom(run_id, start_node_ids):
        raise RuntimeError("executor exploded")

    monkeypatch.setattr("api.engine.executor.run_flow", boom)

    ok = await worker._process_message(b"1-1", {"run_id": "run-1"}, r)

    assert ok is False
    assert r.acked == []
    assert r.deleted == []


async def test_successful_run_is_acknowledged(monkeypatch):
    r = FakeRedis()

    async def fine(run_id, start_node_ids):
        return {"ok": True}

    monkeypatch.setattr("api.engine.executor.run_flow", fine)

    ok = await worker._process_message(b"1-2", {"run_id": "run-2"}, r)

    assert ok is True
    assert r.acked == [b"1-2"]
    assert r.deleted == [b"1-2"]


async def test_retry_count_persists_across_reconnects():
    """E4: the counter lived in a dict rebuilt on every reconnect, so the
    dead-letter threshold could never be reached."""
    r = FakeRedis()

    counts = [await worker._bump_retry(r, b"5-5") for _ in range(4)]

    assert counts == [1, 2, 3, 4]
    assert counts[-1] > worker.MAX_RETRIES

    await worker._clear_retry(r, b"5-5")
    assert await worker._retry_count(r, b"5-5") == 0


async def test_dead_letter_marks_run_failed(fake_supabase):
    """A poisoned job must leave a terminal run, not one stuck in `running`."""
    run = fake_supabase.insert(
        "runs",
        {
            "flow_id": "flow-1",
            "flow_version_id": "ver-1",
            "user_id": "user-1",
            "status": "running",
            "trigger_kind": "manual",
        },
    )[0]

    await worker._reconcile_stuck_run(run["id"], "Exceeded retries")

    row = fake_supabase.select("runs", {"id": f"eq.{run['id']}"}, single=True)
    assert row["status"] == "failed"
    assert "Exceeded retries" in row["error"]


async def test_reconcile_leaves_completed_runs_alone(fake_supabase):
    """Reconciliation must not overwrite a run that already succeeded."""
    run = fake_supabase.insert(
        "runs",
        {
            "flow_id": "flow-1",
            "flow_version_id": "ver-1",
            "user_id": "user-1",
            "status": "succeeded",
            "trigger_kind": "manual",
            "output": "done",
        },
    )[0]

    await worker._reconcile_stuck_run(run["id"], "should not apply")

    row = fake_supabase.select("runs", {"id": f"eq.{run['id']}"}, single=True)
    assert row["status"] == "succeeded"
    assert row["output"] == "done"
