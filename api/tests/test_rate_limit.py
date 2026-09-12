"""Rate limiting: window math, identity, penalties, middleware, auth cache."""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from api.main import create_app
from api.ratelimit import authcache, core, events, penalties
from api.ratelimit.core import evaluate_window, sliding_window_check
from api.ratelimit.dependencies import public_rate_limit
from api.ratelimit.identity import client_ip, fingerprint_from_header, identify


@pytest.fixture(autouse=True)
def reset_ratelimit_state():
    core.reset_memory_state()
    penalties.reset_memory_state()
    authcache.reset_memory_state()
    yield
    core.reset_memory_state()
    penalties.reset_memory_state()
    authcache.reset_memory_state()


@pytest.fixture
def rl_enabled(monkeypatch):
    """Turn rate limiting back on (the suite-wide fixture disables it)."""
    from api import config as config_module

    def _apply(**env: str):
        monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        config_module.get_settings.cache_clear()

    yield _apply
    config_module.get_settings.cache_clear()


# ------------------------------------------------------------- window math


def test_window_allows_until_limit():
    now = 1000.0
    d = evaluate_window([], now, limit=3, window_s=60)
    assert d.allowed and d.remaining == 2 and d.reset_after == 60

    d = evaluate_window([now - 10, now - 5], now, limit=3, window_s=60)
    assert d.allowed and d.remaining == 0


def test_window_denies_at_limit_with_retry():
    now = 1000.0
    prior = [now - 50, now - 30, now - 10]
    d = evaluate_window(prior, now, limit=3, window_s=60)
    assert not d.allowed and d.remaining == 0
    # The oldest entry frees its slot in 10s.
    assert d.retry_after == pytest.approx(10.0)


def test_window_ignores_expired_entries():
    now = 1000.0
    prior = [now - 120, now - 90, now - 10]  # two already outside the window
    d = evaluate_window(prior, now, limit=3, window_s=60)
    assert d.allowed and d.remaining == 1


def test_burst_denies_within_budget():
    now = 1000.0
    prior = [now - 3, now - 2, now - 1]  # 3 in the last 10s, far under limit
    d = evaluate_window(prior, now, limit=100, window_s=60, burst=3, burst_window_s=10)
    assert not d.allowed
    assert d.remaining == 97  # minute budget untouched
    assert d.retry_after == pytest.approx(7.0)


def test_memory_path_admits_and_denies():
    key = f"t:{uuid.uuid4()}"
    decisions = [core._memory_check(key, limit=2, window_s=60, burst=None, burst_window_s=10) for _ in range(3)]
    assert [d.allowed for d in decisions] == [True, True, False]


# ---------------------------------------------------------------- identity


class _StubClient:
    def __init__(self, host):
        self.host = host


class _StubRequest:
    def __init__(self, headers=None, host="10.0.0.9"):
        self.headers = headers or {}
        self.client = _StubClient(host)


def test_identity_precedence():
    fp_header = f"{uuid.uuid4()}.deadbeef"
    request = _StubRequest(headers={"X-Client-Id": fp_header})
    assert identify(request, user_id="u1").key == "user:u1"
    assert identify(request).kind == "fp"
    assert identify(_StubRequest()).kind == "ip"


def test_fingerprint_validation():
    assert fingerprint_from_header(str(uuid.uuid4())) is not None
    assert fingerprint_from_header(f"{uuid.uuid4()}.0123abcd") is not None
    assert fingerprint_from_header("garbage" * 6) is None
    assert fingerprint_from_header("") is None
    assert fingerprint_from_header(None) is None


def test_client_ip_ignores_spoofed_xff_by_default():
    request = _StubRequest(headers={"x-forwarded-for": "6.6.6.6, 7.7.7.7"})
    assert client_ip(request, trusted_proxy_hops=0) == "10.0.0.9"


def test_client_ip_reads_rightmost_trusted_hop():
    request = _StubRequest(headers={"x-forwarded-for": "6.6.6.6, 203.0.113.7"})
    assert client_ip(request, trusted_proxy_hops=1) == "203.0.113.7"
    assert client_ip(request, trusted_proxy_hops=2) == "6.6.6.6"
    # Fewer hops present than trusted -> fall back to the socket peer.
    assert client_ip(_StubRequest(), trusted_proxy_hops=1) == "10.0.0.9"


def test_ip_identity_is_never_blockable():
    assert not identify(_StubRequest()).blockable
    assert identify(_StubRequest(), user_id="u1").blockable


# --------------------------------------------------------------- penalties


async def test_penalty_escalation_local():
    key = "fp:abc"
    blocks = [await penalties.register_violation(None, key) for _ in range(6)]
    # 3rd violation -> 60s, 6th -> 300s; the rest cross no threshold.
    assert blocks[0] is None and blocks[1] is None
    assert blocks[2] == 60.0
    assert blocks[5] == 300.0
    assert await penalties.check_block(None, key) is not None
    assert await penalties.check_block(None, "fp:other") is None


# ------------------------------------------------------------- fake redis


class _FakePipeline:
    def __init__(self, redis):
        self._redis = redis
        self._ops = []

    def __getattr__(self, name):
        def _queue(*args, **kwargs):
            self._ops.append((name, args, kwargs))
            return self

        return _queue

    async def execute(self):
        if self._redis.fail:
            raise ConnectionError("fake redis down")
        return [
            await getattr(self._redis, name)(*args, **kwargs) for name, args, kwargs in self._ops
        ]


class FakeRedis:
    def __init__(self):
        self.zsets: dict[str, dict[bytes, float]] = {}
        self.kv: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.fail = False

    def pipeline(self, transaction=True):
        return _FakePipeline(self)

    async def zremrangebyscore(self, key, low, high):
        z = self.zsets.setdefault(key, {})
        removed = [m for m, s in z.items() if float(low) <= s <= float(high)]
        for m in removed:
            del z[m]
        return len(removed)

    async def zadd(self, key, mapping):
        self.zsets.setdefault(key, {}).update(mapping)
        return len(mapping)

    async def zrange(self, key, start, end, withscores=False):
        items = sorted(self.zsets.get(key, {}).items(), key=lambda kv: kv[1])
        assert withscores
        return items

    async def pexpire(self, key, ms):
        return True

    async def zrem(self, key, member):
        return 1 if self.zsets.get(key, {}).pop(member, None) is not None else 0

    async def incr(self, key):
        if self.fail:
            raise ConnectionError("fake redis down")
        self.kv[key] = str(int(self.kv.get(key, "0")) + 1)
        return int(self.kv[key])

    async def expire(self, key, seconds):
        self.ttls[key] = seconds
        return True

    async def set(self, key, value, ex=None):
        self.kv[key] = str(value)
        if ex is not None:
            self.ttls[key] = ex
        return True

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        self.kv.pop(key, None)
        self.ttls.pop(key, None)
        return 1

    async def ttl(self, key):
        if self.fail:
            raise ConnectionError("fake redis down")
        if key not in self.kv:
            return -2
        return self.ttls.get(key, -1)


async def test_redis_sliding_window():
    redis = FakeRedis()
    key = "unit:redis"
    results = [
        await sliding_window_check(redis, key, limit=2, window_s=60) for _ in range(3)
    ]
    assert [d.allowed for d in results] == [True, True, False]
    # The denied request's optimistic ZADD was rolled back.
    assert len(redis.zsets[f"flowforge:rl:{key}"]) == 2


async def test_redis_failure_falls_back_to_memory():
    redis = FakeRedis()
    redis.fail = True
    d = await sliding_window_check(redis, "unit:fallback", limit=1, window_s=60)
    assert d.allowed
    d = await sliding_window_check(redis, "unit:fallback", limit=1, window_s=60)
    assert not d.allowed  # in-memory bucket carried the state


async def test_penalties_via_redis():
    redis = FakeRedis()
    key = "user:u9"
    blocks = [await penalties.register_violation(redis, key) for _ in range(3)]
    assert blocks == [None, None, 60.0]
    assert await penalties.check_block(redis, key) == 60.0


# -------------------------------------------------------------- middleware


@pytest.fixture
def probe_client(rl_enabled, fake_supabase):
    def _make(**env: str) -> TestClient:
        rl_enabled(**env)
        app = create_app()

        @app.get("/rl-probe")
        async def probe():  # pragma: no cover - trivial
            return {"ok": True}

        # No context manager: the lifespan (real Redis, scheduler) stays off.
        app.state.redis = None
        return TestClient(app)

    return _make


def test_middleware_stamps_headers_and_denies(probe_client):
    client = probe_client(RL_GLOBAL_PER_MIN="3", RL_IP_PER_MIN="1000")

    for expected_remaining in (2, 1, 0):
        r = client.get("/rl-probe")
        assert r.status_code == 200
        assert r.headers["RateLimit-Limit"] == "3"
        assert r.headers["RateLimit-Remaining"] == str(expected_remaining)
        assert "RateLimit-Reset" in r.headers

    r = client.get("/rl-probe")
    assert r.status_code == 429
    assert r.json() == {"detail": "Rate limit exceeded"}
    assert int(r.headers["Retry-After"]) >= 1


def test_health_is_exempt(probe_client):
    client = probe_client(RL_GLOBAL_PER_MIN="1")
    for _ in range(5):
        r = client.get("/health")
        assert r.status_code == 200
        assert "RateLimit-Limit" not in r.headers


def test_ip_precheck_denies_floods(probe_client):
    client = probe_client(RL_GLOBAL_PER_MIN="1000", RL_IP_PER_MIN="2")
    codes = [client.get("/rl-probe").status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_fingerprint_identity_earns_temp_block(probe_client):
    client = probe_client(RL_GLOBAL_PER_MIN="1", RL_IP_PER_MIN="1000")
    headers = {"X-Client-Id": str(uuid.uuid4())}

    assert client.get("/rl-probe", headers=headers).status_code == 200
    # Three violations cross the first penalty threshold...
    for _ in range(3):
        assert client.get("/rl-probe", headers=headers).status_code == 429
    # ...so the next request is rejected by the block, with a long Retry-After.
    r = client.get("/rl-probe", headers=headers)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 60


def test_pure_ip_identity_never_blocked(probe_client):
    client = probe_client(RL_GLOBAL_PER_MIN="1", RL_IP_PER_MIN="1000")
    assert client.get("/rl-probe").status_code == 200
    for _ in range(12):
        r = client.get("/rl-probe")
        assert r.status_code == 429
        # Every denial stays a soft per-window 429 — no escalating block.
        assert int(r.headers["Retry-After"]) <= 60


def test_public_dependency_limits_per_route(rl_enabled, fake_supabase):
    rl_enabled(RL_GLOBAL_PER_MIN="1000", RL_IP_PER_MIN="1000")
    app = create_app()

    @app.get("/dep-probe", dependencies=[Depends(public_rate_limit(max_calls=2, window_s=60))])
    async def dep_probe():  # pragma: no cover - trivial
        return {"ok": True}

    app.state.redis = None
    client = TestClient(app)
    codes = [client.get("/dep-probe").status_code for _ in range(3)]
    assert codes == [200, 200, 429]


# --------------------------------------------------------------- authcache


async def test_authcache_roundtrip_and_invalidate():
    th = authcache.token_hash("token-a")
    assert await authcache.get_cached_user_id(None, th) is None
    await authcache.store_user_id(None, th, "user-1")
    assert await authcache.get_cached_user_id(None, th) == "user-1"
    await authcache.invalidate(None, th)
    assert await authcache.get_cached_user_id(None, th) is None


async def test_authcache_expires(monkeypatch):
    th = authcache.token_hash("token-b")
    await authcache.store_user_id(None, th, "user-2")
    real = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: real + authcache.TTL_S + 1)
    assert await authcache.get_cached_user_id(None, th) is None


async def test_authcache_redis_roundtrip():
    redis = FakeRedis()
    th = authcache.token_hash("token-c")
    await authcache.store_user_id(redis, th, "user-3")
    authcache.reset_memory_state()  # force the Redis path
    assert await authcache.get_cached_user_id(redis, th) == "user-3"


# ------------------------------------------------------------------ events


def test_should_log_rules():
    kwargs = {"sample_rate": 0.0, "rand": 0.99}
    assert events.should_log("GET", 429, "/flows", **kwargs)
    assert events.should_log("GET", 401, "/flows", **kwargs)
    assert events.should_log("POST", 201, "/flows", **kwargs)
    assert events.should_log("GET", 200, "/t/webhook/{token}/info", **kwargs)
    assert not events.should_log("GET", 200, "/flows", **kwargs)
    assert events.should_log("GET", 200, "/flows", sample_rate=0.5, rand=0.4)


def test_parse_user_agent():
    chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
    edge = chrome + " Edg/128.0"
    safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
    assert events.parse_user_agent(chrome) == ("Chrome", "Windows")
    assert events.parse_user_agent(edge) == ("Edge", "Windows")
    assert events.parse_user_agent(safari) == ("Safari", "macOS")
    assert events.parse_user_agent("curl/8.6.0") == ("curl", "Other")
    assert events.parse_user_agent(None) == ("Unknown", "Unknown")


def test_build_event_shape():
    event = events.build_event(
        method="POST",
        path="/t/webhook/{token}",
        status=429,
        user_id=None,
        ip="203.0.113.9",
        fingerprint="abc123",
        user_agent="curl/8.6.0",
        lang="en-US,en;q=0.9",
        tz="America/Vancouver",
    )
    assert event["path"] == "/t/webhook/{token}"
    assert event["lang"] == "en-US"
    assert event["ua_browser"] == "curl"
    assert event["tz"] == "America/Vancouver"
    assert event["ts"].endswith("+00:00")
