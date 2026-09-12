"""The route-class limit table.

Sized for 100–1000 university students who often share one campus NAT:
per-user and per-device limits are generous enough that a human never meets
them, per-IP limits are high enough that a whole campus fits, and the burst
caps stop scripted floods without touching interactive use.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import get_settings


@dataclass(frozen=True)
class Policy:
    name: str
    limit: int
    window_s: float
    burst: int | None = None
    burst_window_s: float = 10.0


def ip_precheck() -> Policy:
    """Applied to every request before auth. Shared by everyone behind a NAT,
    so this is deliberately huge — it only exists to stop raw floods."""
    return Policy("ip", get_settings().RL_IP_PER_MIN, 60.0, burst=300)


def global_default() -> Policy:
    """Applied to every request, keyed on the best identity."""
    return Policy("global", get_settings().RL_GLOBAL_PER_MIN, 60.0, burst=60)


# Route-class policies (per authenticated user unless noted).
EXPENSIVE_RUN = Policy("runs", 30, 60.0, burst=10)
MEDIA_PARSE = Policy("media", 20, 60.0, burst=5)
PUBLIC_SUBMIT = Policy("public-submit", 20, 60.0, burst=8)  # per device
PUBLIC_SUBMIT_IP = Policy("public-submit-ip", 240, 60.0, burst=60)  # NAT co-limit
PUBLIC_SUBMIT_TOKEN = Policy("public-submit-token", 60, 60.0, burst=20)  # per form/webhook
PUBLIC_READ = Policy("public-read", 120, 60.0, burst=40)  # per device
PUBLIC_READ_IP = Policy("public-read-ip", 1200, 60.0, burst=300)  # NAT co-limit
AUTH_ADJACENT = Policy("auth", 20, 60.0, burst=8)  # reserved for future auth endpoints


def expensive_run_hourly() -> Policy:
    """Second window on run creation: caps sustained AI spend per account."""
    return Policy("runs-hourly", get_settings().RL_RUNS_PER_HOUR, 3600.0)
