"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .supabase_url import normalize_supabase_url


def _parse_settings_history_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_settings_history_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

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
    GEMINI_KEY: str = ""
    CLOUDFLARE_ID: str = ""
    CLOUDFLARE_KEY: str = ""
    CLOUDFLARE_GATEWAY_SLUG: str = ""

    WEB_ORIGIN: str = ""
    PUBLIC_API_URL: str = ""

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
