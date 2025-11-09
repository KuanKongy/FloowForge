"use client";

import { createSupabaseBrowserClient } from "./supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

// Memoize the resolved access token so repeated requests don't issue a fresh
// `getSession()` per call. Supabase keeps the token in localStorage and the
// auth client itself caches in memory, but `getSession()` still serializes /
// validates on each call which adds noticeable latency to dashboard pages
// that fire several queries on mount. Storing the bearer token here behind
// an expiry-aware cache cuts most of that overhead.
type CachedToken = { token: string; expiresAt: number } | null;
let cached: CachedToken = null;
const REFRESH_LEEWAY_MS = 60 * 1000;

async function authHeaders(): Promise<Record<string, string>> {
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

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { ...(await authHeaders()) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await formatError("GET", path, res));
  return res.json();
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await formatError("POST", path, res));
  return res.json();
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await formatError("PATCH", path, res));
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
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
  detail = detail.replace(/\s+/g, " ").trim().slice(0, 600);
  return detail
    ? `${method} ${path} failed (${res.status}): ${detail}`
    : `${method} ${path} failed: ${res.status}`;
}
