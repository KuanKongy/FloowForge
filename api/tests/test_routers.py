"""Integration tests for the FastAPI routers using the fake Supabase backend.

We override the ``current_user`` dependency to simulate an authenticated
session and exercise the full request lifecycle:

- POST ``/flows`` creates a flow and a v1 version.
- POST ``/flows/:id/versions`` snapshots a graph.
- POST ``/flows/:id/runs`` enqueues a manual run; with no Arq pool the run
  executes inline (FastAPI awaits the async ``BackgroundTasks``).
- GET ``/runs/:id`` returns the (now succeeded) run + emitted events.
- POST ``/runs/:id/cancel`` flips status to cancelled and broadcasts.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.deps import CurrentUser
from api.main import create_app



def _collect_test_routers_token_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
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


def _ordered_test_routers_token_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]


def _parse_test_routers_history_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_test_routers_history_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

pytestmark = pytest.mark.asyncio


@pytest.fixture

def _merge_test_routers_result_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_test_routers_result_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}


def _shape_test_routers_detail_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_test_routers_detail_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_test_routers_detail_row(row) for row in rows]


def _merge_test_routers_storage_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_test_routers_storage_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

def client(fake_supabase, stub_executors):
    """FastAPI TestClient with auth and node executors stubbed."""

    async def echo(node, inputs, ctx):
        return inputs[0] if inputs else (node.get("data") or {}).get("value")

    stub_executors({"textbox": echo, "llm": echo})

    app = create_app()
    # Bypass the lifespan (no Redis, no scheduler).
    app.state.arq = None
    app.state.scheduler = None
    app.state.public_api_url = "http://test"

    fake_user = CurrentUser(user_id="user-1", access_token="token-1")

    async def _override():
        return fake_user

    from api.deps import current_user

    app.dependency_overrides[current_user] = _override

    with TestClient(app) as tc:
        yield tc


async def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_flow_create_and_version_snapshot(client, fake_supabase):
    r = client.post("/flows", json={"name": "Hello", "tags": []})
    assert r.status_code == 201, r.text
    flow = r.json()
    assert flow["name"] == "Hello"
    assert flow["current_version_id"]

    graph = {
        "nodes": [
            {
                "id": "a",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"value": "hello"},
            }
        ],
        "edges": [],
    }
    r = client.post(
        f"/flows/{flow['id']}/versions",
        json={"graph": graph, "inputs": [], "outputs": []},
    )
    assert r.status_code == 201, r.text
    version = r.json()
    assert version["graph"]["nodes"][0]["id"] == "a"


async def test_run_inline_fallback_executes_and_records_events(client, fake_supabase):
    flow = client.post("/flows", json={"name": "Hello"}).json()
    graph = {
        "nodes": [
            {
                "id": "a",
                "type": "textbox",
                "position": {"x": 0, "y": 0},
                "data": {"value": "hi"},
            },
            {
                "id": "b",
                "type": "llm",
                "position": {"x": 0, "y": 0},
                "data": {},
            },
        ],
        "edges": [{"id": "e1", "source": "a", "target": "b"}],
    }
    version = client.post(
        f"/flows/{flow['id']}/versions",
        json={"graph": graph, "inputs": [], "outputs": []},
    ).json()
    r = client.post(
        f"/flows/{flow['id']}/runs",
        json={"input": None, "version_id": version["id"]},
    )
    assert r.status_code == 201, r.text
    run = r.json()
    # Background task ran on the same loop; the run should now be terminal.
    detail = client.get(f"/runs/{run['id']}").json()
    assert detail["run"]["status"] == "succeeded"
    kinds = {e["kind"] for e in detail["events"]}
    assert {"run_started", "node_started", "node_succeeded", "run_succeeded"} <= kinds
    # ``duration_ms`` was persisted on node_succeeded events.
    durations = [
        e for e in detail["events"]
        if e["kind"] == "node_succeeded" and e.get("duration_ms") is not None
    ]
    assert durations, detail["events"]


async def test_run_with_start_node_ids_records_scope(client, fake_supabase):
    flow = client.post("/flows", json={"name": "Two-trigger"}).json()
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
    version = client.post(
        f"/flows/{flow['id']}/versions",
        json={"graph": graph, "inputs": [], "outputs": []},
    ).json()
    r = client.post(
        f"/flows/{flow['id']}/runs",
        json={"input": None, "version_id": version["id"], "start_node_ids": ["btnA"]},
    )
    assert r.status_code == 201
    run_id = r.json()["id"]
    detail = client.get(f"/runs/{run_id}").json()
    started = {e["node_id"] for e in detail["events"] if e["kind"] == "node_started"}
    # Only `btnA` and its downstream `downA` should have executed.
    assert started == {"btnA", "downA"}
    # ``runs.start_node_ids`` was persisted.
    assert detail["run"].get("start_node_ids") == ["btnA"]


async def test_run_400_surfaces_supabase_message(client, fake_supabase, monkeypatch):
    """If Supabase rejects the ``runs`` insert (the most common cause is the
    project missing migration 0004 ``runs.start_node_ids``), the API must
    surface the actual error body — not a blank 500 — so the editor sidebar
    can show the user something actionable.
    """
    flow = client.post("/flows", json={"name": "Hello"}).json()
    version = client.post(
        f"/flows/{flow['id']}/versions",
        json={
            "graph": {"nodes": [], "edges": []},
            "inputs": [],
            "outputs": [],
        },
    ).json()

    import httpx

    from api.tests.conftest import FakeSupabaseClient

    real_insert = FakeSupabaseClient.insert

    body = (
        '{"code":"PGRST204","details":null,"hint":null,'
        '"message":"Could not find the \\u0027start_node_ids\\u0027 column'
        ' of \\u0027runs\\u0027 in the schema cache"}'
    )

    async def fake_insert(self, table, body_in, *, returning=True):  # type: ignore[no-untyped-def]
        if table == "runs":
            req = httpx.Request("POST", "https://example.supabase.co/rest/v1/runs")
            resp = httpx.Response(400, request=req, content=body)
            raise httpx.HTTPStatusError("400", request=req, response=resp)
        return await real_insert(self, table, body_in, returning=returning)

    monkeypatch.setattr(FakeSupabaseClient, "insert", fake_insert)

    r = client.post(
        f"/flows/{flow['id']}/runs",
        json={"input": None, "version_id": version["id"]},
    )
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "start_node_ids" in detail
    assert "0004_run_scope.sql" in detail


async def test_cancel_run_marks_cancelled(client, fake_supabase, stub_executors):
    """Cancelling a run that hasn't started yet flips its status and emits the
    broadcast that the editor sidebar listens for.
    """
    flow = client.post("/flows", json={"name": "Cancel"}).json()
    version = client.post(
        f"/flows/{flow['id']}/versions",
        json={
            "graph": {"nodes": [], "edges": []},
            "inputs": [],
            "outputs": [],
        },
    ).json()
    # Insert a queued run directly (skip the bg task to avoid completing first).
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
    r = client.post(f"/runs/{run['id']}/cancel")
    assert r.status_code == 200, r.text
    detail = client.get(f"/runs/{run['id']}").json()
    assert detail["run"]["status"] == "cancelled"
    # Broadcast was emitted.
    cancellations = [b for b in fake_supabase.broadcasts if b[1] == "run_cancelled"]
    assert cancellations

class _TestRoutersBrowserEnvelope:
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


def _summarize_test_routers_search_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'test routers'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_test_routers_search_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

