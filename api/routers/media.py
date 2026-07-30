"""Inline media helpers used by the editor (PDF text extraction, etc.)."""
from __future__ import annotations

import asyncio

import pymupdf
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..deps import CurrentUserDep
from ..utils.rate_limit import rate_limit
from fastapi import Depends

router = APIRouter(prefix="/media", tags=["media"])


_MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB safety cap
_CHUNK = 1 * 1024 * 1024


def _extract_text(raw: bytes) -> str:
    """Blocking PyMuPDF work — must run in a thread, never on the event loop."""
    doc = pymupdf.open(stream=raw, filetype="pdf")
    try:
        return "".join((doc.load_page(i).get_text() or "") for i in range(doc.page_count))
    finally:
        doc.close()


@router.post("/parse-pdf", dependencies=[Depends(rate_limit(max_calls=20, window_s=60))])
async def parse_pdf(_: CurrentUserDep, pdf: UploadFile = File(...)):
    # Stream with a running total so an oversized upload is rejected as it
    # arrives, rather than after the whole thing is already in memory.
    chunks: list[bytes] = []
    total = 0
    while chunk := await pdf.read(_CHUNK):
        total += len(chunk)
        if total > _MAX_PDF_BYTES:
            raise HTTPException(413, "PDF exceeds 25 MB limit")
        chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        raise HTTPException(400, "Empty upload")

    try:
        # Parsing a large or malicious PDF used to block every other request on
        # this worker for the duration.
        text = await asyncio.wait_for(asyncio.to_thread(_extract_text, raw), timeout=60)
    except asyncio.TimeoutError:
        raise HTTPException(504, "PDF parsing timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Failed to read PDF: {e}")
    return {"text": text}
