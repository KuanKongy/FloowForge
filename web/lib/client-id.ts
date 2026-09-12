"use client";

/**
 * Anonymous device identity for rate limiting.
 *
 * The API keys anonymous traffic on this header so students behind one campus
 * NAT are limited per device rather than per shared IP. The identifier is a
 * random UUID persisted in localStorage plus a short hash of coarse device
 * signals (user agent, platform, screen size, timezone, language) — no canvas
 * fingerprinting, nothing sent to third parties. See the Privacy Policy.
 */

const STORAGE_KEY = "ff_client_id";

let memoized: string | null = null;

/** FNV-1a 32-bit — tiny and stable; this is a bucket key, not a secret. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deviceSignalsHash(): string {
  try {
    const signals = [
      navigator.userAgent,
      navigator.platform ?? "",
      `${screen.width}x${screen.height}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      navigator.language ?? "",
    ].join("|");
    return fnv1a(signals);
  } catch {
    return "00000000";
  }
}

/** Stable `uuid.hash8` identifier, or null during SSR / blocked storage. */
export function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  if (memoized) return memoized;
  let uuid: string | null = null;
  try {
    uuid = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked (private mode etc.) — fall through to a session id */
  }
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    uuid = crypto.randomUUID();
    try {
      window.localStorage.setItem(STORAGE_KEY, uuid);
    } catch {
      /* per-session identity is still better than none */
    }
  }
  memoized = `${uuid}.${deviceSignalsHash()}`;
  return memoized;
}

export function getClientTz(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** Headers attached to every API request (empty during SSR). */
export function clientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const id = getClientId();
  if (id) headers["X-Client-Id"] = id;
  const tz = getClientTz();
  if (tz) headers["X-Client-Tz"] = tz;
  return headers;
}
