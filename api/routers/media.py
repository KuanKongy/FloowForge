"""Inline media helpers used by the editor (PDF text extraction, etc.)."""
from __future__ import annotations

import pymupdf
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..deps import CurrentUserDep

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
