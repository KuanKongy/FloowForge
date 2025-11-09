"use client";

import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


type SessionFrameRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readSessionFrameLabel(record: SessionFrameRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortSessionFrameRecords(records: SessionFrameRecord[]): SessionFrameRecord[] {
  return records.slice().sort((a, b) => readSessionFrameLabel(a).localeCompare(readSessionFrameLabel(b)));
}

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app/flows";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "oauth") {
      setOauthError("Could not complete Google sign-in. Check Supabase redirect URLs and Google provider setup.");
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setOauthError(null);
    setOauthBusy(true);
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
        return;
      }
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : "Google sign-in failed");
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
          <h1 className="text-2xl font-semibold mt-3">Sign in</h1>
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
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 px-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)]"
            required
            minLength={6}
          />
          {error && <div className="text-sm text-red-500">{error}</div>}
          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="text-center text-xs text-[var(--muted-foreground)] my-4">or</div>
        {oauthError && <div className="text-sm text-red-500 mb-3">{oauthError}</div>}
        <Button variant="outline" onClick={signInWithGoogle} disabled={oauthBusy} className="w-full">
          {oauthBusy ? "Redirecting…" : "Continue with Google"}
        </Button>
        <p className="mt-6 text-sm text-[var(--muted-foreground)] text-center">
          No account?{" "}
          <Link href="/auth/sign-up" className="text-[var(--primary)] font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
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

