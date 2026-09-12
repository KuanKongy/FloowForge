"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .supabase_url import normalize_supabase_url

_ENV_FILE = Path(__file__).resolve().parent / ".env"

_DEFAULT_REDIS_URL = "redis://localhost:6379/0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    REDIS_URL: str = _DEFAULT_REDIS_URL

    OPENAI_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    GEMINI_KEY: str = ""
    CLOUDFLARE_ID: str = ""
    CLOUDFLARE_KEY: str = ""

    WEB_ORIGIN: str = ""
    PUBLIC_API_URL: str = ""

    # "development" additionally trusts localhost for CORS and outbound callbacks.
    ENVIRONMENT: str = "production"

    # Symmetric key for encrypting `integrations.encrypted_credentials` at rest.
    # Generate with: python -c "import secrets;print(secrets.token_urlsafe(32))"
    CREDENTIALS_KEY: str = ""

    # --- Rate limiting -----------------------------------------------------
    # Master switch; the test suite turns it off so repeated runs never trip
    # the global windows.
    RATE_LIMIT_ENABLED: bool = True
    # Number of trusted reverse proxies in front of the API. 0 = trust only
    # the socket peer; N = read the Nth-from-the-right X-Forwarded-For hop.
    TRUSTED_PROXY_HOPS: int = 0
    # Per-identity default applied to every route (user > fingerprint > IP).
    RL_GLOBAL_PER_MIN: int = 300
    # Flood ceiling per IP. Shared by everyone behind a campus NAT, so huge.
    RL_IP_PER_MIN: int = 1200
    # Hourly cap on run creation per account (bounds sustained AI spend).
    RL_RUNS_PER_HOUR: int = 500
    # Client-signal event log (IP, fingerprint, OS/browser, tz, language).
    CLIENT_EVENTS_ENABLED: bool = True
    # Share of ordinary GETs persisted; errors/mutations always are.
    CLIENT_EVENT_SAMPLE_RATE: float = 0.1

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT.lower() in {"dev", "development", "local", "test"}

    @property
    def ALLOW_PRIVATE_CALLBACKS(self) -> bool:
        """Callbacks to localhost/private ranges are only sane in development."""
        return self.is_dev

    @property
    def cors_origins(self) -> list[str]:
        """Allowed browser origins.

        Built from settings rather than hardcoding localhost, which previously
        stayed in the allowlist in production and injected an empty-string origin
        when WEB_ORIGIN was unset.
        """
        origins = [o.strip() for o in self.WEB_ORIGIN.split(",") if o.strip()]
        if self.is_dev:
            for dev_origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
                if dev_origin not in origins:
                    origins.append(dev_origin)
        return origins

    @field_validator("REDIS_URL", mode="before")
    @classmethod
    def empty_redis_url_fallback(cls, v: object) -> object:
        if v is None:
            return _DEFAULT_REDIS_URL
        if isinstance(v, str) and v.strip() == "":
            return _DEFAULT_REDIS_URL
        return v

    @field_validator("SUPABASE_URL", mode="before")
    @classmethod
    def normalize_supabase_root(cls, v: object) -> object:
        if isinstance(v, str) and v.strip():
            return normalize_supabase_url(v)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
