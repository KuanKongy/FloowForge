import { normalizeSupabaseUrl } from "./supabase-url";

/**
 * Name of the Supabase auth cookie (`sb-<project-ref>-auth-token`), shared by
 * the middleware (which reads/refreshes the session) and the marketing header
 * (which only checks for the cookie's presence).
 */
export function supabaseStorageKey(): string | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) return null;
  try {
    const url = normalizeSupabaseUrl(rawUrl);
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}
