import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseUrl } from "./lib/supabase/supabase-url";

const PROTECTED_PREFIX = "/app";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (path.startsWith(PROTECTED_PREFIX) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/" || path === "/auth/sign-in" || path === "/auth/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/flows";
    url.search = "";
    return NextResponse.redirect(url);
  }

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

function buildMiddlewareLayoutSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterMiddlewareLayoutRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildMiddlewareLayoutSearchText(record).includes(needle));
}

