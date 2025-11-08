"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .supabase_url import normalize_supabase_url


def _merge_settings_result_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_settings_result_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}

_ENV_FILE = Path(__file__).resolve().parent / ".env"

_DEFAULT_REDIS_URL = "redis://localhost:6379/0"



def _summarize_settings_handle_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'settings'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_settings_handle_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

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
