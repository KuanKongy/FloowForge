"""Public-form field routing (audit F1).

Before the fix the entry node handed the *entire* payload dict to every child,
so a two-field form delivered both values to both nodes and a one-field form fed
the model ``{'Prompt': 'hello'}`` instead of ``hello``.
"""
from __future__ import annotations

from typing import Any

import pytest

from api.engine.executor import run_flow

pytestmark = pytest.mark.asyncio


def _form_graph() -> dict[str, Any]:
    """manual_in -> (Prompt textbox, Style textbox) -> llm"""
    return {
        "nodes": [
            {"id": "entry", "type": "manual_in", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "n_prompt",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"name": "Prompt", "value": "default prompt"},
            },
            {
                "id": "n_style",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"name": "Style", "value": "default style"},
            },
            {"id": "model", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "entry", "target": "n_prompt"},
            {"id": "e2", "source": "entry", "target": "n_style"},
            {"id": "e3", "source": "n_prompt", "target": "model"},
            {"id": "e4", "source": "n_style", "target": "model"},
        ],
    }


async def test_each_form_field_reaches_its_own_node(
    make_run, fake_supabase, stub_executors
):
    """F1: values keyed by node id must land on the matching node."""
    captured: dict[str, Any] = {}

    async def passthrough(node, inputs, ctx):
        from api.engine.nodes.passthrough import execute as real

        value = await real(node, inputs, ctx)
        captured[node["id"]] = value
        return value

    async def trigger(node, inputs, ctx):
        from api.engine.nodes.trigger_input import execute as real

        return await real(node, inputs, ctx)

    async def model(node, inputs, ctx):
        captured["model_inputs"] = list(inputs)
        return "generated"

    stub_executors({"textbox": passthrough, "manual_in": trigger, "llm": model})

    run_id = make_run(
        _form_graph(),
        run_input={"n_prompt": "a robot painting", "n_style": "watercolour"},
        start_node_ids=["entry"],
    )
    result = await run_flow(run_id, ["entry"])

    assert result["ok"] is True, result
    assert captured["n_prompt"] == "a robot painting"
    assert captured["n_style"] == "watercolour"
    # Neither node may see the other's value or the raw dict.
    assert "watercolour" not in str(captured["n_prompt"])
    assert not isinstance(captured["n_prompt"], dict)


async def test_form_fields_route_by_display_name_too(
    make_run, fake_supabase, stub_executors
):
    """A hand-written webhook payload using labels should still route."""
    captured: dict[str, Any] = {}

    async def passthrough(node, inputs, ctx):
        from api.engine.nodes.passthrough import execute as real

        value = await real(node, inputs, ctx)
        captured[node["id"]] = value
        return value

    async def trigger(node, inputs, ctx):
        from api.engine.nodes.trigger_input import execute as real

        return await real(node, inputs, ctx)

    async def model(node, inputs, ctx):
        return "generated"

    stub_executors({"textbox": passthrough, "manual_in": trigger, "llm": model})

    run_id = make_run(
        _form_graph(),
        run_input={"Prompt": "by name", "Style": "noir"},
        start_node_ids=["entry"],
    )
    await run_flow(run_id, ["entry"])

    assert captured["n_prompt"] == "by name"
    assert captured["n_style"] == "noir"


async def test_single_field_form_delivers_a_bare_value(
    make_run, fake_supabase, stub_executors
):
    """F1: even one field used to arrive as `{'Prompt': 'hello'}`."""
    captured: dict[str, Any] = {}

    async def passthrough(node, inputs, ctx):
        from api.engine.nodes.passthrough import execute as real

        value = await real(node, inputs, ctx)
        captured[node["id"]] = value
        return value

    async def trigger(node, inputs, ctx):
        from api.engine.nodes.trigger_input import execute as real

        return await real(node, inputs, ctx)

    async def model(node, inputs, ctx):
        captured["prompt_seen"] = inputs[0] if inputs else None
        return "generated"

    stub_executors({"textbox": passthrough, "manual_in": trigger, "llm": model})

    graph = {
        "nodes": [
            {"id": "entry", "type": "manual_in", "position": {"x": 0, "y": 0}, "data": {}},
            {
                "id": "n_prompt",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"name": "Prompt"},
            },
            {"id": "model", "type": "llm", "position": {"x": 0, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "entry", "target": "n_prompt"},
            {"id": "e2", "source": "n_prompt", "target": "model"},
        ],
    }
    run_id = make_run(graph, run_input={"n_prompt": "hello"}, start_node_ids=["entry"])
    await run_flow(run_id, ["entry"])

    assert captured["prompt_seen"] == "hello"
    assert not isinstance(captured["prompt_seen"], dict)


async def test_empty_submission_falls_back_to_canvas_defaults(
    make_run, fake_supabase, stub_executors
):
    """The defaults-only path (the one that already worked) must keep working."""
    captured: dict[str, Any] = {}

    async def passthrough(node, inputs, ctx):
        from api.engine.nodes.passthrough import execute as real

        value = await real(node, inputs, ctx)
        captured[node["id"]] = value
        return value

    async def trigger(node, inputs, ctx):
        from api.engine.nodes.trigger_input import execute as real

        return await real(node, inputs, ctx)

    async def model(node, inputs, ctx):
        return "generated"

    stub_executors({"textbox": passthrough, "manual_in": trigger, "llm": model})

    run_id = make_run(_form_graph(), run_input={}, start_node_ids=["entry"])
    await run_flow(run_id, ["entry"])

    assert captured["n_prompt"] == "default prompt"
    assert captured["n_style"] == "default style"


async def test_unaddressed_node_is_not_hijacked(make_run, fake_supabase, stub_executors):
    """A node with no matching key keeps its own saved value."""
    captured: dict[str, Any] = {}

    async def passthrough(node, inputs, ctx):
        from api.engine.nodes.passthrough import execute as real

        value = await real(node, inputs, ctx)
        captured[node["id"]] = value
        return value

    async def trigger(node, inputs, ctx):
        from api.engine.nodes.trigger_input import execute as real

        return await real(node, inputs, ctx)

    async def model(node, inputs, ctx):
        return "generated"

    stub_executors({"textbox": passthrough, "manual_in": trigger, "llm": model})

    run_id = make_run(
        _form_graph(),
        run_input={"n_prompt": "only this one"},
        start_node_ids=["entry"],
    )
    await run_flow(run_id, ["entry"])

    assert captured["n_prompt"] == "only this one"
    assert captured["n_style"] == "default style"
