"use client";

import { createBrowserClient } from "@supabase/ssr";

import { normalizeSupabaseUrl } from "./supabase-url";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
