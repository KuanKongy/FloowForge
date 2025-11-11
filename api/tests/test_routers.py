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


pytestmark = pytest.mark.asyncio


@pytest.fixture
def client(fake_supabase, stub_executors):
    """FastAPI TestClient with auth and node executors stubbed."""

    async def echo(node, inputs, ctx):
        return inputs[0] if inputs else (node.get("data") or {}).get("value")

    stub_executors({"textbox": echo, "llm": echo})

    app = create_app()
    # Bypass the lifespan (no Redis, no scheduler).
    app.state.redis = None
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


async def test_public_webhook_persists_entry_scope_and_run_kind(client, fake_supabase):
    flow = client.post("/flows", json={"name": "Webhook scoped"}).json()
    graph = {
        "nodes": [
            {"id": "hook", "type": "webhook_in", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "downA", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "other", "type": "textbox", "position": {"x": 0, "y": 0}, "data": {"value": "nope"}},
        ],
        "edges": [
            {"id": "e1", "source": "hook", "target": "downA"},
        ],
    }
    client.post(
        f"/flows/{flow['id']}/versions",
        json={"graph": graph, "inputs": [], "outputs": []},
    )
    trigger = fake_supabase.insert(
        "triggers",
        {
            "flow_id": flow["id"],
            "user_id": "user-1",
            "kind": "incoming_webhook",
            "config": {},
            "is_active": True,
            "entry_node_id": "hook",
        },
    )[0]
    fake_supabase.insert(
        "webhook_secrets",
        {"trigger_id": trigger["id"], "token": "tok-hook", "secret": None},
    )

    response = client.post("/t/webhook/tok-hook", json={"hello": "world"})

    assert response.status_code == 200, response.text
    run_id = response.json()["run_id"]
    detail = client.get(f"/runs/{run_id}").json()
    assert detail["run"]["trigger_kind"] == "webhook_in"
    assert detail["run"]["start_node_ids"] == ["hook"]
    started = {e["node_id"] for e in detail["events"] if e["kind"] == "node_started"}
    assert started == {"hook", "downA"}


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
