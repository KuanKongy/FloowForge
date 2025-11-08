"""File parser: PDF -> text via PyMuPDF.

Input may be raw bytes (e.g. from the public webhook), a Supabase Storage path
(string starting with `storage://bucket/path`), or a public URL.
"""
from __future__ import annotations

from typing import Any

import httpx
import pymupdf

from ..context import ExecutionContext



def _parse_file_asset_trigger_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_file_asset_trigger_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped

async def _resolve_bytes(input_value: Any) -> bytes:
    if isinstance(input_value, (bytes, bytearray)):
        return bytes(input_value)
    if isinstance(input_value, str):
        if input_value.startswith("http://") or input_value.startswith("https://"):
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(input_value)
                r.raise_for_status()
                return r.content
        # storage:// not implemented in v1; document path
        raise ValueError(f"Unsupported file reference: {input_value[:64]}")
    raise ValueError(f"Cannot read PDF from input of type {type(input_value).__name__}")


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    if not inputs:
        return ""
    raw = await _resolve_bytes(inputs[0])
    doc = pymupdf.open(stream=raw, filetype="pdf")
    text_parts: list[str] = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        text_parts.append(page.get_text() or "")
    return "".join(text_parts)
