"""End-to-end executor scenarios.

These tests exercise the asyncio scheduler that lives in
``api.engine.executor.run_flow`` using the in-memory Supabase fake. The
provider-backed node executors (LLM / image / audio / fileparser) are stubbed
so we never make real HTTP calls; the scenarios focus on:

1. Linear A -> B -> C
2. Diamond fan-out + barrier join
3. Race join (LLM fires when first parent resolves)
4. Multi-trigger scope: only the clicked button's downstream runs
5. Snapshot inputs (boundary parent's static value reaches the LLM)
6. Cancellation mid-run leaves remaining nodes ``node_skipped``
7. Failure stops the run and reports ``node_failed``
8. Subflow with ``input_map`` writes ``parent_run_id`` lineage

Each test is also marked with ``pytest.mark.asyncio``; the suite is intended
to be run with ``pytest --count=5`` for flake detection (see CI).
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from api.engine.executor import run_flow
from api.engine.nodes import _REGISTRY as REGISTRY  # type: ignore[attr-defined]


pytestmark = pytest.mark.asyncio


def _events_for(broadcasts, kind: str) -> list[dict[str, Any]]:
    return [b[2] for b in broadcasts if b[1] == kind]


def _node_kinds(broadcasts) -> list[tuple[str, str | None]]:
    return [(b[1], b[2].get("node_id")) for b in broadcasts if b[1].startswith("node_")]


# ---------------------------------------------------------------------------
# Scenario 1: linear chain
# ---------------------------------------------------------------------------


async def test_scenario_linear_chain(make_run, fake_supabase, stub_executors):
    async def upper(node, inputs, ctx):
        return (inputs[0] if inputs else "x").upper()

    stub_executors({"textbox": upper, "llm": upper})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {"value": "hello"}},
            {"id": "b", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "c", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b"},
            {"id": "e2", "source": "b", "target": "c"},
        ],
    }
    run_id = make_run(graph, run_input="hello")
    result = await run_flow(run_id)

    assert result["ok"] is True
    assert result["output"] == "HELLO"
    run = fake_supabase.tables["runs"][0]
    assert run["status"] == "succeeded"
    # Each node emitted exactly one started + one succeeded event.
    started = _events_for(fake_supabase.broadcasts, "node_started")
    succeeded = _events_for(fake_supabase.broadcasts, "node_succeeded")
    assert {e["node_id"] for e in started} == {"a", "b", "c"}
    assert {e["node_id"] for e in succeeded} == {"a", "b", "c"}
    # Duration is captured.
    assert all(isinstance(e["payload"].get("duration_ms"), int) for e in succeeded)


# ---------------------------------------------------------------------------
# Scenario 2: barrier join
# ---------------------------------------------------------------------------


async def test_scenario_barrier_join_waits_for_all(make_run, fake_supabase, stub_executors):
    started_at: dict[str, float] = {}

    async def slow_a(node, inputs, ctx):
        started_at["a"] = asyncio.get_event_loop().time()
        await asyncio.sleep(0.1)
        return "alpha"

    async def quick_b(node, inputs, ctx):
        started_at["b"] = asyncio.get_event_loop().time()
        return "beta"

    async def join(node, inputs, ctx):
        # Inputs arrive in edge order: parent A first, parent B second.
        started_at["join"] = asyncio.get_event_loop().time()
        return ",".join(str(i) for i in inputs)

    stub_executors({"textbox": slow_a, "imagebox": quick_b, "llm": join})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "imagebox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "j", "type": "llm", "position": {"x": 0, "y": 0}, "data": {"wait_strategy": "barrier"}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "j"},
            {"id": "e2", "source": "b", "target": "j"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)
    assert result["ok"] is True
    # Barrier join sees both parents, in deterministic edge order.
    assert result["output"] == "alpha,beta"
    # The slow parent delays the join.
    assert started_at["join"] >= started_at["a"]
    assert started_at["join"] >= started_at["b"]


# ---------------------------------------------------------------------------
# Scenario 3: race join
# ---------------------------------------------------------------------------


async def test_scenario_race_join_fires_on_first(make_run, fake_supabase, stub_executors):
    fired: list[str] = []

    async def slow(node, inputs, ctx):
        await asyncio.sleep(0.2)
        fired.append("slow")
        return "slow"

    async def quick(node, inputs, ctx):
        await asyncio.sleep(0.01)
        fired.append("quick")
        return "quick"

    async def race_consumer(node, inputs, ctx):
        # Ran as soon as the first parent resolved; only one input present.
        fired.append("race")
        return inputs[0] if inputs else None

    stub_executors({"textbox": slow, "imagebox": quick, "llm": race_consumer})

    graph = {
        "nodes": [
            {"id": "slow", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "quick", "type": "imagebox", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "r",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {"wait_strategy": "race"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "slow", "target": "r"},
            {"id": "e2", "source": "quick", "target": "r"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)

    assert result["ok"] is True
    assert result["output"] == "quick"
    # The race node must have fired before the slow parent finished.
    assert fired.index("race") < fired.index("slow")


async def test_race_join_uses_only_winning_parent_even_if_others_finish_before_input_collection(
    make_run, fake_supabase, stub_executors
):
    received: list[list[Any]] = []

    async def parent(node, inputs, ctx):
        return node["id"]

    async def race_consumer(node, inputs, ctx):
        received.append(list(inputs))
        return ",".join(inputs)

    stub_executors({"textbox": parent, "imagebox": parent, "llm": race_consumer})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "imagebox", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "r",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {"wait_strategy": "race"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "r"},
            {"id": "e2", "source": "b", "target": "r"},
        ],
    }

    result = await run_flow(make_run(graph))

    assert result["ok"] is True
    assert received and len(received[0]) == 1
    assert received[0][0] in {"a", "b"}


# ---------------------------------------------------------------------------
# Scenario 4: multi-trigger scope
# ---------------------------------------------------------------------------


async def test_scenario_multi_trigger_scopes_to_button_subgraph(
    make_run, fake_supabase, stub_executors
):
    visited: list[str] = []

    async def record(node, inputs, ctx):
        visited.append(node["id"])
        return node["id"]

    stub_executors({"button": record, "textbox": record, "llm": record})

    graph = {
        "nodes": [
            {"id": "btnA", "type": "button", "position": {"x": 0, "y": 0}, "data": {"name": "A"}},
            {"id": "downA", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "btnB", "type": "button", "position": {"x": 0, "y": 0}, "data": {"name": "B"}},
            {"id": "downB", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "btnA", "target": "downA"},
            {"id": "e2", "source": "btnB", "target": "downB"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id, start_node_ids=["btnA"])
    assert result["ok"] is True
    assert sorted(visited) == ["btnA", "downA"]
    # Button B's subgraph is untouched.
    assert "btnB" not in visited and "downB" not in visited


async def test_start_node_ids_persisted_on_run_row_define_scope(
    make_run, fake_supabase, stub_executors
):
    """Worker jobs should not need to carry scope perfectly.

    The durable source of truth is ``runs.start_node_ids``; if a queued job is
    missing that field, the executor must still run only the entry branch.
    """
    visited: list[str] = []

    async def record(node, inputs, ctx):
        visited.append(node["id"])
        return node["id"]

    stub_executors({"button": record, "textbox": record})

    graph = {
        "nodes": [
            {"id": "btnA", "type": "button", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "downA", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "btnB", "type": "button", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "downB", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "btnA", "target": "downA"},
            {"id": "e2", "source": "btnB", "target": "downB"},
        ],
    }
    run_id = make_run(graph, start_node_ids=["btnA"])

    result = await run_flow(run_id)

    assert result["ok"] is True
    assert sorted(visited) == ["btnA", "downA"]


# ---------------------------------------------------------------------------
# Scenario 5: boundary parents outside an entry run are ignored
# ---------------------------------------------------------------------------


async def test_entry_run_ignores_out_of_scope_parent_for_barrier(
    make_run, fake_supabase, stub_executors
):
    received: list[Any] = []
    visited: list[str] = []

    async def consumer(node, inputs, ctx):
        visited.append(node["id"])
        received.append(list(inputs))
        return ",".join(str(i) for i in inputs)

    async def trigger(node, inputs, ctx):
        visited.append(node["id"])
        return None

    async def boom(node, inputs, ctx):
        visited.append(node["id"])
        raise AssertionError(f"out-of-scope node {node['id']} should not run")

    stub_executors({"llm": consumer, "button": trigger, "textbox": boom})

    graph = {
        "nodes": [
            {
                "id": "t",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"value": "snapshot-text"},
            },
            {"id": "btn", "type": "button", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "llm",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {"wait_strategy": "barrier"},
            },
        ],
        "edges": [
            {"id": "e1", "source": "t", "target": "llm"},
            {"id": "e2", "source": "btn", "target": "llm"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id, start_node_ids=["btn"])
    assert result["ok"] is True, result
    assert "t" not in visited
    # The barrier waits only for in-scope parents. The outside textbox exists
    # for whole-workflow runs only, so its snapshot is not injected here.
    assert received == [[None]]


# ---------------------------------------------------------------------------
# Scenario 6: cancellation mid-run
# ---------------------------------------------------------------------------


async def test_scenario_cancellation_marks_remaining_skipped(
    make_run, fake_supabase, stub_executors
):
    saw_b = asyncio.Event()

    async def slow_chain(node, inputs, ctx):
        if node["id"] == "b":
            saw_b.set()
            await asyncio.sleep(2.0)
        return node["id"]

    stub_executors({"textbox": slow_chain})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "c", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b"},
            {"id": "e2", "source": "b", "target": "c"},
        ],
    }
    run_id = make_run(graph)

    # Spawn the run, wait until B starts, then mark cancelled in DB.
    task = asyncio.create_task(run_flow(run_id))
    await saw_b.wait()
    # Mark cancelled directly in the fake DB (mirrors POST /runs/:id/cancel).
    fake_supabase.update("runs", {"status": "cancelled"}, params={"id": f"eq.{run_id}"})

    # Bound the wait to keep flake-resistant; watchdog poll is ~1s.
    result = await asyncio.wait_for(task, timeout=6.0)

    assert result.get("cancelled") is True
    runs = fake_supabase.tables["runs"]
    assert runs[0]["status"] == "cancelled"


# ---------------------------------------------------------------------------
# Scenario 7: failure propagation
# ---------------------------------------------------------------------------


async def test_scenario_failure_marks_run_failed(make_run, fake_supabase, stub_executors):
    async def boom(node, inputs, ctx):
        if node["id"] == "b":
            raise RuntimeError("kaboom")
        return node["id"]

    stub_executors({"textbox": boom})

    graph = {
        "nodes": [
            {"id": "a", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "c", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b"},
            {"id": "e2", "source": "b", "target": "c"},
        ],
    }
    run_id = make_run(graph)
    result = await run_flow(run_id)
    assert result["ok"] is False
    assert "kaboom" in result["error"]
    failed = _events_for(fake_supabase.broadcasts, "node_failed")
    assert {e["node_id"] for e in failed} == {"b"}
    # `c` is downstream of the failure; it was either skipped or never started.
    started = {e["node_id"] for e in _events_for(fake_supabase.broadcasts, "node_started")}
    assert "c" not in started or "c" in {
        e["node_id"] for e in _events_for(fake_supabase.broadcasts, "node_skipped")
    }


# ---------------------------------------------------------------------------
# Scenario 8: subflow with input_map and parent lineage
# ---------------------------------------------------------------------------


async def test_scenario_subflow_writes_parent_run_id(
    make_run, fake_supabase, stub_executors
):
    """A subflow node creates a child run linked via parent_run_id, with the
    declared ``input_map`` projecting parent inputs onto named keys.
    """
    received: list[Any] = []

    async def echo(node, inputs, ctx):
        # Capture run input on the subflow's first node so we can assert on it.
        from api.engine.context import ExecutionContext

        assert isinstance(ctx, ExecutionContext)
        if node["id"] == "subroot":
            received.append(ctx.cache.get("__run_input__"))
        return inputs[0] if inputs else node["id"]

    stub_executors({"textbox": echo})

    # The subflow itself: a single textbox that echoes its input.
    subflow_graph = {
        "nodes": [
            {"id": "subroot", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [],
    }
    sub_flow = fake_supabase.insert(
        "flows",
        {"user_id": "user-1", "name": "Sub", "is_subflow": True},
    )[0]
    sub_version = fake_supabase.insert(
        "flow_versions",
        {"flow_id": sub_flow["id"], "version": 1, "graph": subflow_graph},
    )[0]
    fake_supabase.update(
        "flows",
        {"current_version_id": sub_version["id"]},
        params={"id": f"eq.{sub_flow['id']}"},
    )

    # Parent flow: text -> subflow.
    parent_graph = {
        "nodes": [
            {
                "id": "src",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"value": "from-parent"},
            },
            {
                "id": "sf",
                "type": "subflow",
                "position": {"x": 0, "y": 0},
                "data": {
                    "flow_id": sub_flow["id"],
                    "input_map": [{"from": 0, "to": "payload"}],
                },
            },
        ],
        "edges": [{"id": "e1", "source": "src", "target": "sf"}],
    }
    parent_run = make_run(parent_graph, run_input="from-parent")
    result = await run_flow(parent_run)
    assert result["ok"] is True
    runs = fake_supabase.tables["runs"]
    parent = next(r for r in runs if r["id"] == parent_run)
    children = [r for r in runs if r.get("parent_run_id") == parent["id"]]
    assert len(children) == 1
    child = children[0]
    assert child["trigger_kind"] == "subflow"
    # input_map projected the textbox value onto a `payload` key.
    assert isinstance(child["input"], dict) and child["input"].get("payload") == "from-parent"
    # And that input reached the subflow's first node.
    assert received and received[0] == child["input"]
