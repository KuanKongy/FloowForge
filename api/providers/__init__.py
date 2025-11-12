"""Provider registry. Singletons since clients are stateless after construction."""
from __future__ import annotations

from .base import BaseProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .cloudflare_provider import CloudflareProvider
from .deepseek_provider import DeepSeekProvider


_PROVIDERS: dict[str, BaseProvider] | None = None


def get_provider(name: str) -> BaseProvider | None:
    global _PROVIDERS
    if _PROVIDERS is None:
        _PROVIDERS = {
            "openai": OpenAIProvider(),
            "gemini": GeminiProvider(),
            "cloudflare": CloudflareProvider(),
            "deepseek": DeepSeekProvider(),
        }
    return _PROVIDERS.get(name)


PROVIDER_NAMES = ("openai", "gemini", "cloudflare", "deepseek")
