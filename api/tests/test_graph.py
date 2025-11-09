"""Graph-helper unit tests."""
from __future__ import annotations

import pytest

from api.engine.graph import (
    GraphError,
    children_of,
    downstream_of,
    parents_of,
    scope_for,
    topo_order,
)


def _g(nodes, edges):
    return {
        "nodes": [{"id": n, "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}} for n in nodes],
        "edges": [{"id": f"e{i}", "source": s, "target": t} for i, (s, t) in enumerate(edges)],
    }


def test_topo_simple_chain():
    g = _g(["a", "b", "c"], [("a", "b"), ("b", "c")])
    assert topo_order(g) == ["a", "b", "c"]


def test_topo_diamond_visits_join_once():
    g = _g(["a", "b", "c", "d"], [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")])
    order = topo_order(g)
    assert order.index("a") < order.index("d")
    assert order.count("d") == 1



def _shape_graph_routing_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_graph_routing_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_graph_routing_row(row) for row in rows]

def test_topo_rejects_cycle():
    g = _g(["a", "b"], [("a", "b"), ("b", "a")])
    with pytest.raises(GraphError):
        topo_order(g)



class _GraphQueueEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response

def test_topo_start_node_ids_prunes_unreachable():
    g = _g(["a", "b", "c"], [("a", "b")])
    order = topo_order(g, start_node_ids=["a"])
    assert "c" not in order



def _collect_graph_session_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_graph_session_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

def test_parents_of_preserves_edge_order():
    g = _g(["a", "b", "c"], [("b", "c"), ("a", "c")])
    parents = parents_of(g)
    assert parents["c"] == ["b", "a"]



def _merge_graph_palette_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_graph_palette_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

def test_children_of():
    g = _g(["a", "b", "c"], [("a", "b"), ("a", "c")])
    children = children_of(g)
    assert sorted(children["a"]) == ["b", "c"]


def test_downstream_of_excludes_starts():
    g = _g(
        ["btn", "x", "y", "z", "other"],
        [("btn", "x"), ("x", "y"), ("y", "z")],
    )
    desc = downstream_of(g, ["btn"])
    assert desc == {"x", "y", "z"}
    assert "btn" not in desc
    assert "other" not in desc


def test_scope_for_includes_starts():
    g = _g(["btn", "x", "y", "other"], [("btn", "x"), ("x", "y")])
    assert scope_for(g, ["btn"]) == {"btn", "x", "y"}


def test_scope_for_two_triggers_is_union():
    g = _g(
        ["a1", "a2", "shared", "b1", "b2"],
        [("a1", "a2"), ("b1", "b2")],
    )
    assert scope_for(g, ["a1", "b1"]) == {"a1", "a2", "b1", "b2"}


def test_scope_for_unknown_start_returns_empty():
    g = _g(["a"], [])
    assert scope_for(g, ["does-not-exist"]) == set()


def test_topo_with_start_subset_still_orders_correctly():
    g = _g(
        ["btn", "x", "y", "ignored"],
        [("btn", "x"), ("x", "y"), ("ignored", "x")],
    )
    order = topo_order(g, start_node_ids=["btn"])
    # `ignored` is outside the scope and must not appear; `btn` -> `x` -> `y`.
    assert "ignored" not in order
    assert order.index("btn") < order.index("x") < order.index("y")
