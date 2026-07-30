"""Executor regression tests for the P1 findings in docs/AUDIT.md.

Reverting any of the corresponding fixes makes one of these fail (E1 fails by
timing out, which is why it carries an explicit deadline).
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from api.engine.executor import run_flow

pytestmark = pytest.mark.asyncio


def _kinds(broadcasts, kind: str) -> list[dict[str, Any]]:
    return [b[2] for b in broadcasts if b[1] == kind]


# ---------------------------------------------------------------------------
# E1 — a race node whose parents all fail must not deadlock
# ---------------------------------------------------------------------------


async def test_race_node_with_all_parents_failed_terminates(
    make_run, fake_supabase, stub_executors
):
    """E1: this hung forever and, with a sequential worker, stalled the queue."""

    async def boom(node, inputs, ctx):
        raise RuntimeError("parent exploded")

    async def echo(node, inputs, ctx):
        return inputs[0] if inputs else None

    stub_executors({"textbox": boom, "llm": echo})

    graph = {
        "nodes": [
            {"id": "p1", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "p2", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "racer",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {"wait_strategy": "race"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "p1", "target": "racer"},
            {"id": "e2", "source": "p2", "target": "racer"},
        ],
    }
    run_id = make_run(graph)

    # A deadlock would hang the suite, so bound it explicitly.
    result = await asyncio.wait_for(run_flow(run_id), timeout=10)

    assert result["ok"] is False
    skipped = [e["node_id"] for e in _kinds(fake_supabase.broadcasts, "node_skipped")]
    assert "racer" in skipped


async def test_race_node_still_fires_on_first_successful_parent(
    make_run, fake_supabase, stub_executors
):
    """The E1 fix must not break the normal race path."""

    async def slow_ok(node, inputs, ctx):
        await asyncio.sleep(0.05)
        return "slow"

    async def fast_ok(node, inputs, ctx):
        return "fast"

    async def echo(node, inputs, ctx):
        return inputs[0] if inputs else None

    stub_executors({"textbox": fast_ok, "imagebox": slow_ok, "llm": echo})

    graph = {
        "nodes": [
            {"id": "fast", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "slow", "type": "imagebox", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "racer",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {"wait_strategy": "race"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "fast", "target": "racer"},
            {"id": "e2", "source": "slow", "target": "racer"},
        ],
    }
    run_id = make_run(graph)
    result = await asyncio.wait_for(run_flow(run_id), timeout=10)

    assert result["ok"] is True
    assert result["output"] == "fast"


# ---------------------------------------------------------------------------
# E2 / E3 — run claiming
# ---------------------------------------------------------------------------


async def test_run_cancelled_while_queued_is_not_executed(
    make_run, fake_supabase, stub_executors
):
    """E2: run_flow unconditionally set status=running, undoing the cancel."""
    executed: list[str] = []

    async def track(node, inputs, ctx):
        executed.append(node["id"])
        return "ran"

    stub_executors({"textbox": track})

    graph = {
        "nodes": [{"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}}],
        "edges": [],
    }
    run_id = make_run(graph)
    fake_supabase.update("runs", {"status": "cancelled"}, params={"id": f"eq.{run_id}"})

    result = await run_flow(run_id)

    assert result.get("skipped") is True
    assert executed == []
    row = fake_supabase.select("runs", {"id": f"eq.{run_id}"}, single=True)
    assert row["status"] == "cancelled"


async def test_duplicate_delivery_executes_run_once(
    make_run, fake_supabase, stub_executors
):
    """E3: a redelivered Redis message ran the flow (and its billing) twice."""
    calls: list[str] = []

    async def track(node, inputs, ctx):
        calls.append(node["id"])
        return "ok"

    stub_executors({"textbox": track})

    graph = {
        "nodes": [{"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}}],
        "edges": [],
    }
    run_id = make_run(graph)

    first, second = await asyncio.gather(run_flow(run_id), run_flow(run_id))

    assert calls == ["a"], calls
    assert {bool(first.get("ok")), bool(second.get("ok"))} == {True, False}


# ---------------------------------------------------------------------------
# E7 — deterministic final output
# ---------------------------------------------------------------------------


async def test_header_node_cannot_become_the_final_output(
    make_run, fake_supabase, stub_executors
):
    """E7: `header` has no executor, yet could win the sink race and null the output."""

    async def produce(node, inputs, ctx):
        return "real-result"

    stub_executors({"llm": produce})

    graph = {
        "nodes": [
            {"id": "start", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
            # A display-only header, disconnected, therefore also a sink.
            {"id": "title", "type": "header", "position": {"x": 0, "y": 0}, "data": {"text": "Hi"}},
        ],
        "edges": [],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)

    assert result["ok"] is True
    assert result["output"] == "real-result"


async def test_final_output_prefers_the_deepest_sink(
    make_run, fake_supabase, stub_executors
):
    """E7: with two sinks the result must follow the graph, not scheduling luck."""

    async def shallow(node, inputs, ctx):
        return "shallow-sink"

    async def deep(node, inputs, ctx):
        await asyncio.sleep(0.01)
        return "deep-sink"

    stub_executors({"textbox": shallow, "llm": deep})

    graph = {
        "nodes": [
            {"id": "root", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "mid", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "leaf", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "root", "target": "mid"},
            {"id": "e2", "source": "mid", "target": "leaf"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)

    assert result["ok"] is True
    assert result["output"] == "deep-sink"


# ---------------------------------------------------------------------------
# E6 — subflow recursion
# ---------------------------------------------------------------------------


async def test_self_referencing_subflow_is_rejected(fake_supabase, stub_executors):
    """E6: a flow containing itself recursed until memory death."""

    flow = fake_supabase.insert("flows", {"user_id": "user-1", "name": "Loop"})[0]
    version = fake_supabase.insert(
        "flow_versions",
        {
            "flow_id": flow["id"],
            "version": 1,
            "graph": {
                "nodes": [
                    {
                        "id": "s1",
                        "type": "subflow",
                        "position": {"x": 0, "y": 0},
                        "data": {"flow_id": flow["id"]},
                    }
                ],
                "edges": [],
            },
            "inputs": [],
            "outputs": [],
        },
    )[0]
    fake_supabase.update(
        "flows", {"current_version_id": version["id"]}, params={"id": f"eq.{flow['id']}"}
    )

    # Run it as a top-level run; the subflow node then re-enters the same flow.
    run = fake_supabase.insert(
        "runs",
        {
            "flow_id": flow["id"],
            "flow_version_id": version["id"],
            "user_id": "user-1",
            "status": "queued",
            "trigger_kind": "manual",
            "input": None,
        },
    )[0]

    result = await asyncio.wait_for(run_flow(run["id"]), timeout=20)

    assert result["ok"] is False
    assert "recursive" in (result.get("error") or "").lower()

    # And it must not have spawned a pile of runs.
    assert len(fake_supabase.tables["runs"]) < 5


# ---------------------------------------------------------------------------
# E11 — dangling edges must not shift input metadata
# ---------------------------------------------------------------------------


async def test_dangling_edge_does_not_shift_input_metadata(
    make_run, fake_supabase, stub_executors
):
    """E11: inputs and input_meta fell out of step, mis-assigning chat roles."""
    seen: dict[str, Any] = {}

    async def produce(node, inputs, ctx):
        return f"from-{node['id']}"

    async def capture(node, inputs, ctx):
        seen["inputs"] = list(inputs)
        seen["meta"] = ctx.cache.get(f"__input_meta__:{node['id']}")
        return "done"

    stub_executors({"textbox": produce, "llm": capture})

    graph = {
        "nodes": [
            {"id": "real", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {"name": "Real"}},
            {"id": "sink", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        # `ghost` does not exist in nodes — a stale edge left by the editor.
        "edges": [
            {"id": "e1", "source": "ghost", "target": "sink"},
            {"id": "e2", "source": "real", "target": "sink"},
        ],
    }
    run_id = make_run(graph)
    await run_flow(run_id)

    assert len(seen["inputs"]) == len(seen["meta"]), (seen["inputs"], seen["meta"])
    assert seen["meta"][0]["name"] == "Real"


# ---------------------------------------------------------------------------
# E10 — duplicate edges must not double-feed
# ---------------------------------------------------------------------------


async def test_duplicate_edges_feed_input_once(make_run, fake_supabase, stub_executors):
    """E10: two edges between the same pair delivered the value twice."""
    seen: dict[str, Any] = {}

    async def produce(node, inputs, ctx):
        return "value"

    async def capture(node, inputs, ctx):
        seen["inputs"] = list(inputs)
        return "done"

    stub_executors({"textbox": produce, "llm": capture})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b"},
            {"id": "e2", "source": "a", "target": "b"},
        ],
    }
    run_id = make_run(graph)
    await run_flow(run_id)

    assert seen["inputs"] == ["value"]


# ---------------------------------------------------------------------------
# E12 — telemetry failures must not fail the run
# ---------------------------------------------------------------------------


async def test_run_survives_event_persistence_failure(
    make_run, fake_supabase, stub_executors, monkeypatch
):
    """E12: a transient run_events insert error failed the node with a bad message."""
    from api.tests.conftest import FakeSupabaseClient

    real_insert = FakeSupabaseClient.insert

    async def flaky_insert(self, table, body, *, returning=True):
        if table == "run_events":
            raise RuntimeError("PostgREST unavailable")
        return await real_insert(self, table, body, returning=returning)

    monkeypatch.setattr(FakeSupabaseClient, "insert", flaky_insert)

    async def produce(node, inputs, ctx):
        return "still-works"

    stub_executors({"textbox": produce})

    graph = {
        "nodes": [{"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}}],
        "edges": [],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)

    assert result["ok"] is True
    assert result["output"] == "still-works"
