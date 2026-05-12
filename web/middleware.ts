import { NextResponse, type NextRequest } from "next/server";

import { normalizeSupabaseUrl } from "./lib/supabase/supabase-url";

const PROTECTED_PREFIX = "/app";
const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
const SESSION_COOKIE_CHUNK_SIZE = 3180;
const SESSION_REFRESH_MARGIN_SECONDS = 60;
const BASE64_PREFIX = "base64-";

type CookieToSet = {
  name: string;
  value: string;
  options: {
    path: string;
    sameSite: "lax";
    maxAge?: number;
  };
};

type SupabaseSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
};

type AuthState = {
  hasSession: boolean;
  cookiesToSet: CookieToSet[];
};

function getSupabaseConfig() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  return { url, anonKey, storageKey };
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookieChunks(
  request: NextRequest,
  key: string
): { value: string | null; names: string[] } {
  const direct = request.cookies.get(key);
  const chunks: string[] = [];
  const names: string[] = direct?.value ? [key] : [];

  for (let index = 0; ; index += 1) {
    const name = `${key}.${index}`;
    const chunk = request.cookies.get(name);
    if (!chunk?.value) break;
    chunks.push(chunk.value);
    names.push(name);
  }

  return { value: direct?.value ?? (chunks.length > 0 ? chunks.join("") : null), names };
}

function readSession(
  request: NextRequest,
  key: string
): { session: SupabaseSession | null; names: string[] } {
  const { value, names } = readCookieChunks(request, key);
  if (!value) return { session: null, names };

  try {
    const decoded = value.startsWith(BASE64_PREFIX)
      ? base64UrlDecode(value.slice(BASE64_PREFIX.length))
      : value;
    return { session: JSON.parse(decoded) as SupabaseSession, names };
  } catch {
    return { session: null, names };
  }
}

function clearSessionCookies(names: string[]): CookieToSet[] {
  return names.map((name) => ({
    name,
    value: "",
    options: { path: "/", sameSite: "lax" as const, maxAge: 0 },
  }));
}

function createSessionCookies(
  key: string,
  session: SupabaseSession,
  staleCookieNames: string[]
): CookieToSet[] {
  const encoded = `${BASE64_PREFIX}${base64UrlEncode(JSON.stringify(session))}`;
  const encodedChunks = encoded.match(new RegExp(`.{1,${SESSION_COOKIE_CHUNK_SIZE}}`, "g")) ?? [
    "",
  ];
  const chunks =
    encodedChunks.length === 1
      ? [{ name: key, value: encoded }]
      : encodedChunks.map((chunk, index) => ({
          name: `${key}.${index}`,
          value: chunk,
        }));

  const nextNames = new Set(chunks.map(({ name }) => name));
  const removals = clearSessionCookies(staleCookieNames.filter((name) => !nextNames.has(name)));

  return [
    ...removals,
    ...chunks.map(({ name, value }) => ({
      name,
      value,
      options: { path: "/", sameSite: "lax" as const, maxAge: SESSION_COOKIE_MAX_AGE },
    })),
  ];
}

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
}

function tokenExpiresSoon(session: SupabaseSession): boolean {
  if (!session.expires_at) return false;
  return session.expires_at <= Math.floor(Date.now() / 1000) + SESSION_REFRESH_MARGIN_SECONDS;
}

async function refreshSession(
  session: SupabaseSession,
  staleCookieNames: string[]
): Promise<AuthState> {
  if (!session.refresh_token) {
    return { hasSession: false, cookiesToSet: clearSessionCookies(staleCookieNames) };
  }

  const { url, anonKey, storageKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!response.ok) {
    return { hasSession: false, cookiesToSet: clearSessionCookies(staleCookieNames) };
  }

  const refreshed = (await response.json()) as SupabaseSession;
  if (!refreshed.access_token || !refreshed.refresh_token) {
    return { hasSession: false, cookiesToSet: clearSessionCookies(staleCookieNames) };
  }

  const nextSession = {
    ...session,
    ...refreshed,
    expires_at:
      refreshed.expires_at ??
      (refreshed.expires_in
        ? Math.floor(Date.now() / 1000) + refreshed.expires_in
        : session.expires_at),
  };

  return {
    hasSession: true,
    cookiesToSet: createSessionCookies(storageKey, nextSession, staleCookieNames),
  };
}

async function validateSession(session: SupabaseSession): Promise<boolean> {
  if (!session.access_token) return false;

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${session.access_token}`,
    },
  });
  return response.ok;
}

async function getAuthState(request: NextRequest, validateAccessToken: boolean): Promise<AuthState> {
  const { storageKey } = getSupabaseConfig();
  const { session, names } = readSession(request, storageKey);
  if (!session?.access_token) {
    return { hasSession: false, cookiesToSet: clearSessionCookies(names) };
  }

  if (tokenExpiresSoon(session)) {
    return refreshSession(session, names);
  }

  if (validateAccessToken) {
    const isValid = await validateSession(session);
    if (!isValid) return refreshSession(session, names);
  }

  return { hasSession: true, cookiesToSet: [] };
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const authState = await getAuthState(request, !path.startsWith(PROTECTED_PREFIX));

  if (path.startsWith(PROTECTED_PREFIX) && !authState.hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", path);
    const response = NextResponse.redirect(url);
    applyCookies(response, authState.cookiesToSet);
    return response;
  }

  if (
    authState.hasSession &&
    (path === "/" || path === "/auth/sign-in" || path === "/auth/sign-up")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    const response = NextResponse.redirect(url);
    applyCookies(response, authState.cookiesToSet);
    return response;
  }

  const response = NextResponse.next({ request });
  applyCookies(response, authState.cookiesToSet);
  return response;
}

// Only run the auth check on routes that actually need it. Previously the
// matcher excluded just static assets, which meant every page navigation
// (including API/data routes) triggered a Supabase ``getUser()`` round-trip
// and made the app feel sluggish. Limiting the matcher to ``/``, ``/auth/*``,
// and ``/app/*`` keeps the SSR auth gate in place while letting public/CSR
// routes navigate instantly.
export const config = {
  matcher: ["/", "/auth/:path*", "/app/:path*"],
};
