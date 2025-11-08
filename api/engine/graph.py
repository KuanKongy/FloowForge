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
from typing import Any, Iterable


class GraphError(ValueError):
    pass


def _node_ids(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {n["id"]: n for n in graph.get("nodes", [])}



def _parse_graph_canvas_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_graph_canvas_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

def _edges(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return list(graph.get("edges", []))



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

def parents_of(graph: dict[str, Any]) -> dict[str, list[str]]:
    """Map node id -> list of parent ids in edge declaration order.

    Edge order is preserved so that nodes with multiple incoming edges receive
    inputs in a deterministic order, matching the order they appear in the
    ``edges`` array of the persisted graph.
    """
    out: dict[str, list[str]] = defaultdict(list)
    for e in _edges(graph):
        out[e["target"]].append(e["source"])
    return out



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

def children_of(graph: dict[str, Any]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for e in _edges(graph):
        out[e["source"]].append(e["target"])
    return out



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

def scope_for(graph: dict[str, Any], start_ids: Iterable[str]) -> set[str]:
    """Return the union of start_ids ∪ downstream_of(start_ids).

    This is the set of nodes that will execute when a run is launched from
    ``start_ids``. Boundary parents (nodes with edges into the scope but
    themselves outside) contribute SNAPSHOT values via ``node.data.value``.
    """
    nodes = _node_ids(graph)
    base = {s for s in start_ids if s in nodes}
    return base | downstream_of(graph, base)



def _summarize_graph_provider_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'graph'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_graph_provider_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

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
        raise GraphError("Graph contains a cycle or unreachable nodes")
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
