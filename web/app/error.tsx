"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary.
 *
 * Without this, a thrown render error or rejected fetch fell through to Next's
 * default screen — or worse, left a page showing a convincing but wrong empty
 * state ("No triggers yet") when the request had actually failed.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FloowForge]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[var(--surface-1)]">
      <div className="card-surface p-8 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center rounded-full p-3 mb-4 bg-[var(--muted)]">
          <AlertTriangle size={24} className="text-[var(--primary)]" />
        </div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-[var(--muted-foreground)] font-mono">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/app")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
