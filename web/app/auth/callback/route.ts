import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseUrl } from "@/lib/supabase/supabase-url";

function safeNextPath(next: string | null): string {
  const fallback = "/app/flows";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next"));

  const toSignInWithOauthError = () => {
    const deny = new URL("/auth/sign-in", url.origin);
    deny.searchParams.set("error", "oauth");
    return NextResponse.redirect(deny.toString());
  };

  if (!code) {
    return toSignInWithOauthError();
  }

  const redirectTo = new URL(nextPath, url.origin).toString();
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return toSignInWithOauthError();
  }

  return response;
}
