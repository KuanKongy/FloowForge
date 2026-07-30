"""Cross-tenant access-control tests (audit S2, S3, S4, S5).

The existing suite overrides `current_user` with a single identity and the fake
Supabase client aliases `as_user` to `as_service`, so no test ever exercised
ownership. These tests drive two identities against the same fake database and
assert that one cannot reach the other's data.

Because the fake does not implement RLS, these tests only prove the checks the
application performs *explicitly* — which is exactly what the audit fixes added.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.deps import CurrentUser, current_user
from api.main import create_app

pytestmark = pytest.mark.asyncio

VICTIM = "user-victim"
ATTACKER = "user-attacker"


@pytest.fixture
def app_factory(fake_supabase, stub_executors):
    """Build a TestClient bound to a chosen user id."""

    async def echo(node, inputs, ctx):
        return inputs[0] if inputs else (node.get("data") or {}).get("value")

    stub_executors({"textbox": echo, "llm": echo})

    app = create_app()
    app.state.redis = None
    app.state.scheduler = None
    app.state.public_api_url = "http://test"

    def _as(user_id: str) -> TestClient:
        async def _override():
            return CurrentUser(user_id=user_id, access_token=f"token-{user_id}")

        app.dependency_overrides[current_user] = _override
        return TestClient(app)

    return _as


def _make_flow_with_version(client: TestClient, name: str) -> tuple[dict, dict]:
    flow = client.post("/flows", json={"name": name}).json()
    version = client.post(
        f"/flows/{flow['id']}/versions",
        json={
            "graph": {
                "nodes": [
                    {"id": "t1", "type": "textbox", "position": {"x": 0, "y": 0},
                     "data": {"value": "victim-secret-data"}}
                ],
                "edges": [],
            },
            "inputs": [],
            "outputs": [],
        },
    ).json()
    return flow, version


# ---------------------------------------------------------------------------
# S2 — webhook-info must not leak another tenant's token
# ---------------------------------------------------------------------------


async def test_webhook_info_denies_other_users_trigger(app_factory, fake_supabase):
    """S2: this used a service-role query filtered only on trigger_id."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Victim flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "incoming_webhook", "config": {}},
    ).json()

    # The owner can read it.
    assert victim.get(f"/triggers/{trigger['id']}/webhook-info").status_code == 200

    attacker = app_factory(ATTACKER)
    stolen = attacker.get(f"/triggers/{trigger['id']}/webhook-info")
    assert stolen.status_code == 404, stolen.text
    assert "token" not in stolen.text


async def test_webhook_info_never_returns_the_shared_secret(app_factory):
    """The signing secret must not travel to the browser via this endpoint."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Secret flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "incoming_webhook", "config": {}},
    ).json()

    info = victim.get(f"/triggers/{trigger['id']}/webhook-info").json()
    assert "secret" not in info


# ---------------------------------------------------------------------------
# S5 — triggers must not attach to another tenant's flow
# ---------------------------------------------------------------------------


async def test_cannot_create_trigger_on_another_users_flow(app_factory):
    """S5: attaching a public trigger to a victim flow made it publicly runnable."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Victim flow")

    attacker = app_factory(ATTACKER)
    r = attacker.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}, "show_outputs": True},
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# S4 — runs must not execute another tenant's flow version
# ---------------------------------------------------------------------------


async def test_cannot_run_another_users_flow_version(app_factory):
    """S4: version_id was written into runs.flow_version_id unvalidated."""
    victim = app_factory(VICTIM)
    victim_flow, victim_version = _make_flow_with_version(victim, "Victim flow")

    attacker = app_factory(ATTACKER)
    own_flow, _ = _make_flow_with_version(attacker, "Attacker flow")

    r = attacker.post(
        f"/flows/{own_flow['id']}/runs",
        json={"input": None, "version_id": victim_version["id"]},
    )
    assert r.status_code == 404, r.text


async def test_cannot_run_another_users_flow(app_factory):
    """Running a flow you do not own returns 404 rather than 500."""
    victim = app_factory(VICTIM)
    victim_flow, _ = _make_flow_with_version(victim, "Victim flow")

    attacker = app_factory(ATTACKER)
    r = attacker.post(f"/flows/{victim_flow['id']}/runs", json={"input": None})
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# S3 — public endpoints must respect show_outputs and trigger scoping
# ---------------------------------------------------------------------------


async def test_public_status_hides_output_when_show_outputs_false(app_factory, fake_supabase):
    """S3: /runs/{id} returned output+error while ignoring show_outputs."""
    victim = app_factory(VICTIM)
    flow, version = _make_flow_with_version(victim, "Form flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]

    run = fake_supabase.insert(
        "runs",
        {
            "flow_id": flow["id"],
            "flow_version_id": version["id"],
            "user_id": VICTIM,
            "status": "succeeded",
            "trigger_kind": "public_in",
            "trigger_id": trigger["id"],
            "output": "TOP-SECRET-OUTPUT",
            "error": "raw provider error body",
        },
    )[0]

    r = victim.get(f"/t/webhook/{token}/runs/{run['id']}")
    assert r.status_code == 200, r.text
    assert "TOP-SECRET-OUTPUT" not in r.text
    assert "raw provider error body" not in r.text


async def test_public_status_cannot_read_runs_from_other_triggers(app_factory, fake_supabase):
    """S3: matching on flow_id exposed the owner's private editor runs."""
    victim = app_factory(VICTIM)
    flow, version = _make_flow_with_version(victim, "Form flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}, "show_outputs": True},
    ).json()
    token = trigger["webhook"]["token"]

    # A private run of the same flow, started from the editor (no trigger_id).
    private_run = fake_supabase.insert(
        "runs",
        {
            "flow_id": flow["id"],
            "flow_version_id": version["id"],
            "user_id": VICTIM,
            "status": "succeeded",
            "trigger_kind": "manual",
            "output": "PRIVATE-EDITOR-RUN",
        },
    )[0]

    r = victim.get(f"/t/webhook/{token}/runs/{private_run['id']}")
    assert r.status_code == 404, r.text
    assert "PRIVATE-EDITOR-RUN" not in r.text


async def test_public_result_returns_output_when_enabled(app_factory, fake_supabase):
    """The feature still works when the owner opted in."""
    victim = app_factory(VICTIM)
    flow, version = _make_flow_with_version(victim, "Form flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}, "show_outputs": True},
    ).json()
    token = trigger["webhook"]["token"]

    run = fake_supabase.insert(
        "runs",
        {
            "flow_id": flow["id"],
            "flow_version_id": version["id"],
            "user_id": VICTIM,
            "status": "succeeded",
            "trigger_kind": "public_in",
            "trigger_id": trigger["id"],
            "output": "SHAREABLE-RESULT",
        },
    )[0]

    r = victim.get(f"/t/webhook/{token}/result/{run['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["output"] == "SHAREABLE-RESULT"


async def test_webhook_info_not_exposed_for_machine_webhooks(app_factory):
    """Only public forms should publish their input schema."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Machine webhook")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "incoming_webhook", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]

    r = victim.get(f"/t/webhook/{token}/info")
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# S11 — public webhook payload cap
# ---------------------------------------------------------------------------


async def test_public_webhook_rejects_oversized_body(app_factory):
    """S11: `await request.body()` was unbounded."""
    from api.routers.triggers import MAX_WEBHOOK_BODY_BYTES

    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Form flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]

    huge = b"x" * (MAX_WEBHOOK_BODY_BYTES + 1024)
    r = victim.post(
        f"/t/webhook/{token}",
        content=huge,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 413, r.status_code


# ---------------------------------------------------------------------------
# S7 — signature enforcement on machine webhooks
# ---------------------------------------------------------------------------


async def test_machine_webhook_requires_signature(app_factory):
    """S7: an unsigned request to a machine webhook must be rejected."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Machine webhook")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "incoming_webhook", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]

    r = victim.post(f"/t/webhook/{token}", json={"hello": "world"})
    assert r.status_code == 401, r.text


async def test_machine_webhook_accepts_valid_signature(app_factory):
    import json as _json
    import time

    from api.webhooks import SIGNATURE_HEADER, TIMESTAMP_HEADER, sign_payload

    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Machine webhook")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "incoming_webhook", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]
    secret = trigger["webhook"]["secret"]

    raw = _json.dumps({"hello": "world"}).encode()
    ts = str(int(time.time()))
    r = victim.post(
        f"/t/webhook/{token}",
        content=raw,
        headers={
            "Content-Type": "application/json",
            TIMESTAMP_HEADER: ts,
            SIGNATURE_HEADER: sign_payload(secret, raw, ts),
        },
    )
    assert r.status_code == 200, r.text
    assert "run_id" in r.json()


async def test_public_form_does_not_require_signature(app_factory):
    """Browsers cannot hold a shared secret, so forms stay unsigned."""
    victim = app_factory(VICTIM)
    flow, _ = _make_flow_with_version(victim, "Form flow")
    trigger = victim.post(
        "/triggers",
        json={"flow_id": flow["id"], "kind": "public_form", "config": {}},
    ).json()
    token = trigger["webhook"]["token"]

    r = victim.post(f"/t/webhook/{token}", json={})
    assert r.status_code == 200, r.text
