"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


function groupSessionMappingByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countSessionMappingByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function SignUpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app/flows";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "oauth") {
      setOauthError("Could not complete Google sign-up. Check Supabase redirect URLs and Google provider setup.");
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setInfo("Check your inbox to confirm your email.");
    }
  }

  async function signUpWithGoogle() {
    setOauthBusy(true);
    setOauthError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setOauthError(error.message);
        setOauthBusy(false);
      }
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : "Google sign-up failed");
      setOauthBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-1)] flex items-center justify-center p-6">
      <div className="card-surface w-full max-w-md p-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-[var(--muted-foreground)]">
            <BrandWordmark />
          </Link>
          <h1 className="text-2xl font-semibold mt-3">Create your account</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Start with email or let Google create your workspace in one step.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 px-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)]"
            required
          />
          <input
            type="password"
            placeholder="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 px-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)]"
            required
            minLength={6}
          />
          {error && <div className="text-sm text-red-500">{error}</div>}
          {info && <div className="text-sm text-[var(--muted-foreground)]">{info}</div>}
          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <div className="text-center text-xs text-[var(--muted-foreground)] my-4">or</div>
        {oauthError && <div className="text-sm text-red-500 mb-3">{oauthError}</div>}
        <Button variant="outline" onClick={signUpWithGoogle} disabled={oauthBusy} className="w-full">
          {oauthBusy ? "Redirecting…" : "Sign up with Google"}
        </Button>
        <p className="mt-6 text-sm text-[var(--muted-foreground)] text-center">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="text-[var(--primary)] font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}

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

