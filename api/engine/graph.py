"""Graph utilities for the executor.

Includes:
- ``topo_order`` (Kahn) for cycle detection / ordering when we don't need a
  custom scheduler.
- ``parents_of`` / ``children_of`` adjacency builders.
- ``downstream_of`` / ``scope_for`` to compute the per-trigger subgraph that
  fires when a Button (or other entry node) is the explicit start.
- ``collect_inputs`` for the legacy in-order parent-output collector.
"""
from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable
from typing import Any


class GraphError(ValueError):
    pass


def _node_ids(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {n["id"]: n for n in graph.get("nodes", [])}


def _edges(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return list(graph.get("edges", []))


def parents_of(graph: dict[str, Any]) -> dict[str, list[str]]:
    """Map node id -> list of parent ids in edge declaration order.

    Edge order is preserved so that nodes with multiple incoming edges receive
    inputs in a deterministic order, matching the order they appear in the
    ``edges`` array of the persisted graph.
    """
    out: dict[str, list[str]] = defaultdict(list)
    for e in _edges(graph):
        # Two edges between the same pair are a UI artifact, not two inputs;
        # keeping both fed the parent's output into the child twice.
        if e["source"] not in out[e["target"]]:
            out[e["target"]].append(e["source"])
    return out


def children_of(graph: dict[str, Any]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for e in _edges(graph):
        if e["target"] not in out[e["source"]]:
            out[e["source"]].append(e["target"])
    return out


def downstream_of(graph: dict[str, Any], start_ids: Iterable[str]) -> set[str]:
    """BFS forward from each id in ``start_ids``; returns descendants only.

    The returned set does NOT include the start ids themselves; callers can
    union if they want. Handy when you need "everything that runs because of
    these triggers, but not the triggers".
    """
    nodes = _node_ids(graph)
    children = children_of(graph)
    seen: set[str] = set()
    queue: deque[str] = deque()
    for s in start_ids:
        if s in nodes:
            for c in children.get(s, []):
                if c in nodes:
                    queue.append(c)
    while queue:
        n = queue.popleft()
        if n in seen:
            continue
        seen.add(n)
        for c in children.get(n, []):
            if c not in seen and c in nodes:
                queue.append(c)
    return seen


def scope_for(graph: dict[str, Any], start_ids: Iterable[str]) -> set[str]:
    """Return the union of start_ids ∪ downstream_of(start_ids).

    This is the set of nodes that will execute when a run is launched from
    ``start_ids``.
    """
    nodes = _node_ids(graph)
    base = {s for s in start_ids if s in nodes}
    return base | downstream_of(graph, base)


def topo_order(
    graph: dict[str, Any],
    *,
    start_node_ids: list[str] | None = None,
) -> list[str]:
    """Kahn's-algorithm topological sort. Used for legacy callers and as a
    cycle detector before kicking off the asyncio executor.

    When ``start_node_ids`` is given, the output is restricted to the scope
    (start ∪ downstream).
    """
    nodes = _node_ids(graph)
    edges = _edges(graph)

    if start_node_ids is not None:
        scope = scope_for(graph, start_node_ids)
        nodes = {nid: n for nid, n in nodes.items() if nid in scope}
        edges = [e for e in edges if e["source"] in scope and e["target"] in scope]

    in_deg: dict[str, int] = {nid: 0 for nid in nodes}
    children: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        s, t = e["source"], e["target"]
        if s not in nodes or t not in nodes:
            continue
        children[s].append(t)
        in_deg[t] += 1

    roots = [nid for nid, d in in_deg.items() if d == 0]
    queue: deque[str] = deque(roots)
    order: list[str] = []
    seen: set[str] = set()
    while queue:
        n = queue.popleft()
        if n in seen:
            continue
        seen.add(n)
        order.append(n)
        for c in children.get(n, []):
            in_deg[c] -= 1
            if in_deg[c] <= 0:
                queue.append(c)

    if len(order) != len(nodes):
        stuck = sorted(set(nodes) - seen)
        raise GraphError(
            "Graph contains a cycle involving: " + ", ".join(stuck[:5])
            + ("…" if len(stuck) > 5 else "")
        )
    return order


def collect_inputs(
    node_id: str,
    parents: dict[str, list[str]],
    outputs: dict[str, Any],
) -> list[Any]:
    """Return parent outputs in stable edge-declared order; missing parents
    are skipped (used by legacy callers; the asyncio executor builds inputs
    itself so it can also include boundary snapshots).
    """
    return [outputs[p] for p in parents.get(node_id, []) if p in outputs]
