"use client";

import { createSupabaseBrowserClient } from "./supabase/client";

const DEFAULT_API_URL = "http://localhost:5001";

function normalizeApiUrl(value: string | undefined): string {
  const url = value?.trim();
  if (!url || url === "/") return DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

const API = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

// Memoize the resolved access token so repeated requests don't issue a fresh
// `getSession()` per call. Supabase keeps the token in localStorage and the
// auth client itself caches in memory, but `getSession()` still serializes /
// validates on each call which adds noticeable latency to dashboard pages
// that fire several queries on mount. Storing the bearer token here behind
// an expiry-aware cache cuts most of that overhead.
type CachedToken = { token: string; expiresAt: number } | null;
let cached: CachedToken = null;
const REFRESH_LEEWAY_MS = 60 * 1000;

/** Drop the memoized bearer token. */
export function clearTokenCache(): void {
  cached = null;
}

// Signing out (or switching accounts in the same tab) left the previous user's
// token in this module-level cache until it expired naturally, so requests kept
// going out as the old identity.
let authListenerBound = false;
function bindAuthListener() {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;
  createSupabaseBrowserClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      cached = null;
    }
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  bindAuthListener();
  const now = Date.now();
  if (cached && cached.expiresAt - now > REFRESH_LEEWAY_MS) {
    return { Authorization: `Bearer ${cached.token}` };
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();
  let session = currentSession;

  if (!session?.access_token) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session ?? null;
  }

  const token = session?.access_token;
  if (token) {
    const expiresAt =
      (session?.expires_at ? session.expires_at * 1000 : now + 30 * 60 * 1000);
    cached = { token, expiresAt };
    return { Authorization: `Bearer ${token}` };
  }

  cached = null;
  return {};
}

// Requests used to hang indefinitely if the API never answered.
const REQUEST_TIMEOUT_MS = 30_000;

async function request(method: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // A 401 means the memoized token is stale; drop it so the next call re-reads
  // the session instead of replaying the rejected credential.
  if (res.status === 401) clearTokenCache();
  return res;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await request("GET", path, {
    headers: { ...(await authHeaders()) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await formatError("GET", path, res));
  return res.json();
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await request("POST", path, {
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await formatError("POST", path, res));
  return res.json();
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await request("PATCH", path, {
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await formatError("PATCH", path, res));
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await request("DELETE", path, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok && res.status !== 204) throw new Error(await formatError("DELETE", path, res));
}

async function formatError(method: string, path: string, res: Response): Promise<string> {
  // Try to surface the API/Supabase-formatted message so callers can show
  // something better than "POST /flows/.../runs failed: 500".
  let detail = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text) as { detail?: string; error?: string; message?: string };
        detail = json.detail || json.error || json.message || text;
      } catch {
        detail = text;
      }
    }
  } catch {
    /* ignore body read errors */
  }
  const contentType = res.headers.get("content-type") ?? "";
  const receivedHtml = contentType.includes("text/html") || /^<!doctype html/i.test(detail);
  detail = detail.replace(/\s+/g, " ").trim().slice(0, receivedHtml ? 180 : 600);
  if (receivedHtml) {
    detail =
      `received an HTML page from ${res.url || "the request URL"} instead of the FastAPI JSON response. ` +
      `On Vercel, set NEXT_PUBLIC_API_URL to the deployed FastAPI origin (${API} is currently baked into this build) and redeploy.`;
  }
  return detail
    ? `${method} ${path} failed (${res.status}): ${detail}`
    : `${method} ${path} failed: ${res.status}`;
}
