import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseUrl } from "@/lib/supabase/supabase-url";


const sessionviewportTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveSessionViewportTone(status: string | undefined): keyof typeof sessionviewportTone {
  if (status && status in sessionviewportTone) return status as keyof typeof sessionviewportTone;
  return 'queued';
}

function safeNextPath(next: string | null): string {
  const fallback = "/app/flows";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}


function buildSessionHandleSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterSessionHandleRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildSessionHandleSearchText(record).includes(needle));
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

type SessionFrameRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readSessionFrameLabel(record: SessionFrameRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortSessionFrameRecords(records: SessionFrameRecord[]): SessionFrameRecord[] {
  return records.slice().sort((a, b) => readSessionFrameLabel(a).localeCompare(readSessionFrameLabel(b)));
}

