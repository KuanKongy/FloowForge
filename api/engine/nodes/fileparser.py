"""File parser: file payload/reference -> text.

Input may be raw bytes (e.g. from the public webhook), a Supabase Storage path
(string starting with `storage://bucket/path`), or a public URL.
"""
from __future__ import annotations

import base64
import json
import pathlib
from typing import Any

import httpx
import pymupdf

from ..context import ExecutionContext

_TEXT_MIME_TYPES = {
    "application/json",
    "application/x-ndjson",
    "application/xml",
    "application/yaml",
    "text/csv",
    "text/html",
    "text/markdown",
    "text/plain",
    "text/tab-separated-values",
    "text/xml",
}
_TEXT_EXTENSIONS = {".csv", ".json", ".jsonl", ".log", ".md", ".txt", ".tsv", ".xml", ".yaml", ".yml"}


def _metadata(input_value: Any) -> tuple[str | None, str | None]:
    if isinstance(input_value, dict):
        return (
            str(input_value.get("mime") or "") or None,
            str(input_value.get("name") or "") or None,
        )
    return None, None


def _looks_like_pdf(raw: bytes) -> bool:
    return raw.startswith(b"%PDF")


def _is_text_like(mime: str | None, name: str | None) -> bool:
    if mime:
        lower = mime.lower()
        if lower.startswith("text/") or lower in _TEXT_MIME_TYPES:
            return True
    if name:
        return pathlib.Path(name).suffix.lower() in _TEXT_EXTENSIONS
    return False


async def _resolve_bytes(input_value: Any) -> bytes:
    if isinstance(input_value, (bytes, bytearray)):
        return bytes(input_value)
    if isinstance(input_value, dict):
        data_url = input_value.get("data_url") or input_value.get("value")
        if isinstance(data_url, str):
            return await _resolve_bytes(data_url)
    if isinstance(input_value, str):
        if input_value.startswith("data:"):
            try:
                _header, encoded = input_value.split(",", 1)
                return base64.b64decode(encoded)
            except Exception as exc:
                raise ValueError(f"Invalid file data URL: {exc}") from exc
        if input_value.startswith(("http://", "https://")):
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(input_value)
                r.raise_for_status()
                return r.content
        # storage:// not implemented in v1; document path
        raise ValueError(f"Unsupported file reference: {input_value[:64]}")
    raise ValueError(f"Cannot read file from input of type {type(input_value).__name__}")


async def execute(node: dict, inputs: list[Any], ctx: ExecutionContext) -> str:
    if not inputs or inputs[0] is None:
        raise ValueError("File Parser needs a file input. Connect a File Box with a selected file.")
    input_value = inputs[0]
    mime, name = _metadata(input_value)
    raw = await _resolve_bytes(input_value)
    if _looks_like_pdf(raw) or (mime or "").lower() == "application/pdf" or (name or "").lower().endswith(".pdf"):
        try:
            doc = pymupdf.open(stream=raw, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"Failed to parse PDF: {exc}") from exc
        text_parts: list[str] = []
        for i in range(doc.page_count):
            page = doc.load_page(i)
            text_parts.append(page.get_text() or "")
        return "".join(text_parts)

    if _is_text_like(mime, name):
        text = raw.decode("utf-8-sig", errors="replace")
        if (mime or "").lower() == "application/json" or (name or "").lower().endswith(".json"):
            try:
                return json.dumps(json.loads(text), indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                return text
        return text

    label = name or mime or type(input_value).__name__
    raise ValueError(
        f"File Parser cannot parse '{label}' yet. "
        "Supported types today: PDF and text-like files (txt, md, csv, json, xml, yaml)."
    )
