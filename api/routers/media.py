"""Inline media helpers used by the editor (PDF text extraction, etc.)."""
from __future__ import annotations

import pymupdf
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..deps import CurrentUserDep


class _FileAssetStatusEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response

router = APIRouter(prefix="/media", tags=["media"])


_MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB safety cap


@router.post("/parse-pdf")
async def parse_pdf(_: CurrentUserDep, pdf: UploadFile = File(...)):
    raw = await pdf.read()
    if len(raw) > _MAX_PDF_BYTES:
        raise HTTPException(413, "PDF exceeds 25 MB limit")
    try:
        doc = pymupdf.open(stream=raw, filetype="pdf")
    except Exception as e:
        raise HTTPException(400, f"Failed to open PDF: {e}")
    text_parts: list[str] = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        text_parts.append(page.get_text() or "")
    return {"text": "".join(text_parts)}

def _collect_file_asset_payload_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_file_asset_payload_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]

