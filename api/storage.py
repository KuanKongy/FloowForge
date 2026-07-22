"""Supabase Storage helpers for run-generated media.

Generated images and audio used to travel through the graph as base64 ``data:``
URLs. A single 1024x1024 image is ~500 KB-3 MB once base64-encoded, which:

* exceeds the Supabase Realtime per-message limit (~256 KB), so the
  ``node_succeeded`` broadcast was rejected with 422 and the editor never
  received the image at all;
* got truncated to 4000 chars by ``_snapshot_for_event`` before landing in
  ``run_events``, so reopening a run showed a corrupt data URL;
* bloated ``runs.output`` with half-megabyte blobs per run.

We now upload the bytes once to a public bucket and pass a short https URL
through the graph instead. The bucket is created on first use so deployments
need no manual provisioning step.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

import httpx

from .config import get_settings
from .supabase_url import normalize_supabase_url

log = logging.getLogger(__name__)

BUCKET = "run-media"

# 50 MB, matching the bucket's own file_size_limit.
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

_EXT_BY_MIME: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
}

# Magic-byte prefixes. Providers habitually mislabel their output (Cloudflare
# returns JPEG from Flux but the REST response says nothing about the type),
# so we sniff rather than trust.
_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"ID3", "audio/mpeg"),
    (b"OggS", "audio/ogg"),
)

_bucket_ready = False
_bucket_lock = asyncio.Lock()


def sniff_mime(blob: bytes, fallback: str | None = None) -> str:
    """Detect a media type from magic bytes, falling back to the claimed one."""
    for prefix, mime in _MAGIC:
        if blob.startswith(prefix):
            return mime
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "image/webp"
    if blob[4:8] == b"ftyp":
        return "audio/mp4"
    # Bare MPEG audio frames have no container header.
    if blob[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    return fallback or "application/octet-stream"


def _extension(mime: str) -> str:
    return _EXT_BY_MIME.get(mime.split(";")[0].strip().lower(), "bin")


def _headers() -> dict[str, str]:
    key = get_settings().SUPABASE_SERVICE_ROLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


async def _ensure_bucket(client: httpx.AsyncClient, root: str) -> None:
    """Create the media bucket once per process. Idempotent across replicas."""
    global _bucket_ready
    if _bucket_ready:
        return
    async with _bucket_lock:
        if _bucket_ready:
            return
        response = await client.post(
            f"{root}/storage/v1/bucket",
            headers={**_headers(), "Content-Type": "application/json"},
            json={
                "id": BUCKET,
                "name": BUCKET,
                "public": True,
                "file_size_limit": _MAX_UPLOAD_BYTES,
            },
        )
        # 409 / "already exists" is the normal path on every run but the first.
        if response.is_success or response.status_code == 409 or "exists" in (response.text or ""):
            _bucket_ready = True
            return
        raise httpx.HTTPStatusError(
            f"Could not create storage bucket '{BUCKET}': "
            f"{response.status_code} {(response.text or '')[:200]}",
            request=response.request,
            response=response,
        )


async def upload_media(
    blob: bytes,
    mime: str | None,
    *,
    run_id: str,
    node_id: str,
) -> str:
    """Upload generated media and return its public URL.

    Raises on failure so the node fails loudly instead of emitting a payload
    the editor silently drops.
    """
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Supabase storage is not configured (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY missing), so generated media cannot be "
            "stored."
        )
    if len(blob) > _MAX_UPLOAD_BYTES:
        raise ValueError(f"Generated media is {len(blob)} bytes, over the 50 MB limit.")

    resolved_mime = sniff_mime(blob, mime)
    path = f"{run_id}/{node_id}-{uuid.uuid4().hex[:12]}.{_extension(resolved_mime)}"
    root = normalize_supabase_url(settings.SUPABASE_URL)

    async with httpx.AsyncClient(timeout=60.0) as client:
        await _ensure_bucket(client, root)
        response = await client.post(
            f"{root}/storage/v1/object/{BUCKET}/{path}",
            headers={**_headers(), "Content-Type": resolved_mime, "x-upsert": "true"},
            content=blob,
        )
        if not response.is_success:
            raise httpx.HTTPStatusError(
                f"Storage upload of {path} failed: {response.status_code} "
                f"{(response.text or '')[:300]}",
                request=response.request,
                response=response,
            )

    url = f"{root}/storage/v1/object/public/{BUCKET}/{path}"
    log.info("Uploaded %d bytes of %s to %s", len(blob), resolved_mime, path)
    return url
