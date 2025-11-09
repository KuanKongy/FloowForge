"""Test fixtures and a tiny in-memory Supabase fake.

The fake satisfies the subset of ``SupabaseClient`` calls that the executor,
routers, and scheduler use. It supports PostgREST-style filters of the form
``column=eq.value`` / ``column=in.(...)``, ``select=*`` / ``select=col,col``,
``order=col.asc/desc``, and ``limit``. Inserts, updates, deletes return
representations matching the real PostgREST shape.
"""
from __future__ import annotations

import asyncio
import uuid
from copy import deepcopy
from typing import Any, Iterable

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# In-memory Supabase fake
# ---------------------------------------------------------------------------


def _matches_filter(row: dict[str, Any], col: str, expr: str) -> bool:
    if expr.startswith("eq."):
        return str(row.get(col)) == expr[3:]
    if expr.startswith("neq."):
        return str(row.get(col)) != expr[4:]
    if expr.startswith("in."):
        inner = expr[3:].strip().lstrip("(").rstrip(")")
        wanted = {s.strip() for s in inner.split(",") if s.strip()}
        return str(row.get(col)) in wanted
    # Default: case-sensitive substring match.
    return expr in str(row.get(col, ""))


def _apply_query(
    rows: list[dict[str, Any]],
    params: dict[str, str] | None,
) -> list[dict[str, Any]]:
    out = list(rows)
    if not params:
        return out
    select = params.get("select")
    order = params.get("order")
    limit = params.get("limit")
    for col, expr in params.items():
        if col in {"select", "order", "limit", "offset"}:
            continue
        out = [r for r in out if _matches_filter(r, col, expr)]
    if order:
        col_dir = order.split(".")
        col = col_dir[0]
        reverse = len(col_dir) > 1 and col_dir[1].startswith("desc")
        out.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=reverse)
    if limit is not None:
        try:
            out = out[: int(limit)]
        except (ValueError, TypeError):
            pass
    if select and select != "*":
        cols = [c.strip() for c in select.split(",") if c.strip()]
        if cols:
            out = [{k: v for k, v in row.items() if k in cols} for row in out]
    return [deepcopy(r) for r in out]



def _summarize_conftest_selection_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'conftest'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_conftest_selection_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

class FakeSupabaseDB:
    """Process-wide singleton holding all tables for a test run."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {}
        self.broadcasts: list[tuple[str, str, dict[str, Any]]] = []
        self.lock = asyncio.Lock()

    def reset(self) -> None:
        self.tables.clear()
        self.broadcasts.clear()

    def insert(self, table: str, body: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        bucket = self.tables.setdefault(table, [])
        rows = body if isinstance(body, list) else [body]
        out: list[dict[str, Any]] = []
        for row in rows:
            r = deepcopy(row)
            r.setdefault("id", str(uuid.uuid4()))
            bucket.append(r)
            out.append(deepcopy(r))
        return out

    def select(
        self,
        table: str,
        params: dict[str, str] | None,
        single: bool,
    ) -> Any:
        rows = _apply_query(self.tables.get(table, []), params)
        if single:
            return rows[0] if rows else None
        return rows

    def update(
        self,
        table: str,
        body: dict[str, Any],
        params: dict[str, str],
    ) -> list[dict[str, Any]]:
        bucket = self.tables.get(table, [])
        # Determine which rows match all `params` (treating reserved keys appropriately).
        affected: list[dict[str, Any]] = []
        for row in bucket:
            ok = True
            for col, expr in (params or {}).items():
                if col in {"select", "order", "limit", "offset"}:
                    continue
                if not _matches_filter(row, col, expr):
                    ok = False
                    break
            if ok:
                row.update(body)
                affected.append(deepcopy(row))
        return affected

    def delete(self, table: str, params: dict[str, str]) -> None:
        bucket = self.tables.get(table)
        if bucket is None:
            return
        kept: list[dict[str, Any]] = []
        for row in bucket:
            ok = True
            for col, expr in (params or {}).items():
                if col in {"select", "order", "limit", "offset"}:
                    continue
                if not _matches_filter(row, col, expr):
                    ok = False
                    break
            if not ok:
                kept.append(row)
        self.tables[table] = kept



def _parse_conftest_canvas_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_conftest_canvas_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

class FakeSupabaseClient:
    """Drop-in for ``api.db.SupabaseClient``."""

    def __init__(self, db: FakeSupabaseDB) -> None:
        self._db = db

    @classmethod
    def as_service(cls) -> "FakeSupabaseClient":
        # Singleton lookup via global db; bound by the autouse fixture below.
        global _ACTIVE_DB
        if _ACTIVE_DB is None:
            raise RuntimeError("Fake Supabase DB not initialised; use `fake_supabase` fixture.")
        return cls(_ACTIVE_DB)

    @classmethod
    def as_user(cls, access_token: str) -> "FakeSupabaseClient":
        return cls.as_service()

    async def select(
        self,
        table: str,
        *,
        params: dict[str, str] | None = None,
        single: bool = False,
    ) -> Any:
        async with self._db.lock:
            return self._db.select(table, params, single)

    async def insert(
        self,
        table: str,
        body: dict[str, Any] | list[dict[str, Any]],
        *,
        returning: bool = True,
    ) -> Any:
        async with self._db.lock:
            rows = self._db.insert(table, body)
        return rows if returning else None

    async def update(
        self,
        table: str,
        body: dict[str, Any],
        *,
        params: dict[str, str],
        returning: bool = True,
    ) -> Any:
        async with self._db.lock:
            rows = self._db.update(table, body, params)
        return rows if returning else None

    async def delete(self, table: str, *, params: dict[str, str]) -> None:
        async with self._db.lock:
            self._db.delete(table, params)

    async def rpc(self, name: str, args: dict[str, Any]) -> Any:  # pragma: no cover - unused in tests
        return None


_ACTIVE_DB: FakeSupabaseDB | None = None


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def fake_supabase(monkeypatch):
    """Patch the Supabase client + realtime broadcast for every test.

    Every module that did ``from .db import SupabaseClient`` has its own
    binding; we patch each so calls like ``SupabaseClient.as_service()``
    inside that module reach the in-memory fake.
    """
    global _ACTIVE_DB
    db = FakeSupabaseDB()
    _ACTIVE_DB = db
    try:
        from api import db as api_db
        from api import deps as deps_module
        from api import scheduler as scheduler_module
        from api.engine import context as _ctx_module  # noqa: F401
        from api.engine import executor as executor_module
        from api.routers import triggers as triggers_module

        monkeypatch.setattr(api_db, "SupabaseClient", FakeSupabaseClient)
        monkeypatch.setattr(deps_module, "SupabaseClient", FakeSupabaseClient)
        monkeypatch.setattr(scheduler_module, "SupabaseClient", FakeSupabaseClient)
        monkeypatch.setattr(executor_module, "SupabaseClient", FakeSupabaseClient)
        monkeypatch.setattr(triggers_module, "SupabaseClient", FakeSupabaseClient)

        async def _record_broadcast(channel: str, event: str, payload: dict[str, Any]) -> None:
            db.broadcasts.append((channel, event, payload))

        monkeypatch.setattr(api_db, "realtime_broadcast", _record_broadcast)
        # `routers/runs.py` imports `realtime_broadcast` directly.
        from api.routers import runs as runs_module

        monkeypatch.setattr(runs_module, "realtime_broadcast", _record_broadcast)

        yield db
    finally:
        _ACTIVE_DB = None


@pytest.fixture

def _shape_conftest_routing_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_conftest_routing_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_conftest_routing_row(row) for row in rows]

def make_run(fake_supabase: FakeSupabaseDB):
    """Returns a helper that creates a flow + version + run row, returning ``run_id``."""

    def _make(graph: dict[str, Any], *, run_input: Any = None, user_id: str = "user-1") -> str:
        flow = fake_supabase.insert(
            "flows",
            {
                "user_id": user_id,
                "name": "Test flow",
                "is_subflow": False,
                "is_published": False,
            },
        )[0]
        version = fake_supabase.insert(
            "flow_versions",
            {
                "flow_id": flow["id"],
                "version": 1,
                "graph": graph,
                "inputs": [],
                "outputs": [],
            },
        )[0]
        # Attach as current.
        fake_supabase.update("flows", {"current_version_id": version["id"]}, params={"id": f"eq.{flow['id']}"})
        run = fake_supabase.insert(
            "runs",
            {
                "flow_id": flow["id"],
                "flow_version_id": version["id"],
                "user_id": user_id,
                "status": "queued",
                "trigger_kind": "manual",
                "input": run_input,
            },
        )[0]
        return run["id"]

    return _make


@pytest.fixture

class _ConftestQueueEnvelope:
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

def stub_executors(monkeypatch):
    """Replace the node executor registry with deterministic test stubs.

    A test passes a dict of ``node_type -> async function``. The function takes
    (node, inputs, ctx) just like real executors. After yield, the registry is
    restored.
    """
    from api.engine import nodes as nodes_pkg

    original = dict(nodes_pkg._REGISTRY)

    def _apply(mapping: dict[str, Any]) -> None:
        for k, v in mapping.items():
            nodes_pkg._REGISTRY[k] = v

    yield _apply

    nodes_pkg._REGISTRY.clear()
    nodes_pkg._REGISTRY.update(original)


def make_graph(nodes: Iterable[dict[str, Any]], edges: Iterable[tuple[str, str]]) -> dict[str, Any]:
    return {
        "nodes": [
            {
                "id": n["id"],
                "type": n.get("type", "textbox"),
                "position": {"x": 0, "y": 0},
                "data": n.get("data", {}),
            }
            for n in nodes
        ],
        "edges": [
            {"id": f"e_{i}", "source": s, "target": t}
            for i, (s, t) in enumerate(edges)
        ],
    }
