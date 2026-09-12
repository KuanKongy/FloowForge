"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { clientHeaders } from "@/lib/client-id";
import { isAudioValue, isImageValue } from "@/lib/media";

type RunResult = {
  id?: string;
  status?: string;
  output?: unknown;
  ended_at?: string;
  error?: string;
};

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001").replace(/\/+$/, "");

// Give up after ~5 minutes rather than polling a dead run forever.
const MAX_POLL_ATTEMPTS = 150;

export default function ResultPage() {
  const params = useParams<{ token: string; runId: string }>();
  const { token, runId } = params;

  const [result, setResult] = useState<RunResult | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let attempts = 0;
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    async function poll() {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        stop();
        setError("Stopped waiting for this run. Refresh to check again.");
        return;
      }
      try {
        const res = await fetch(`${API}/t/webhook/${token}/result/${runId}`, {
          headers: clientHeaders(),
        });
        if (!res.ok) {
          // A 404 is terminal (bad link); other codes may be transient.
          if (res.status === 404) {
            stop();
            setError("This result is no longer available.");
          } else if (res.status === 429) {
            setError("Checking a little too often — still waiting for the result.");
          } else {
            setError(`Error: ${res.status}`);
          }
          return;
        }
        setError(null);
        const data = await res.json();
        if (data.status === "results_disabled") {
          setDisabled(true);
          stop();
          return;
        }
        setResult(data);
        if (["succeeded", "failed", "cancelled"].includes(data.status)) {
          stop();
        }
      } catch {
        /* ignore transient network errors; the attempt cap bounds this */
      }
    }

    void poll();
    pollRef.current = setInterval(poll, 2000);
    return stop;
  }, [token, runId]);

  const isTerminal =
    result &&
    ["succeeded", "failed", "cancelled"].includes(result.status || "");

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-6 flex items-center gap-2">
          <BrandWordmark />
          <span className="text-[var(--muted-foreground)]">/ results</span>
        </header>

        <div className="card-surface p-6">
          {error ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : disabled ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <XCircle size={32} className="text-[var(--muted-foreground)]" />
              <p className="text-sm text-[var(--muted-foreground)]">
                Results are not available for this form.
              </p>
            </div>
          ) : !isTerminal ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--muted-foreground)]">Processing…</p>
            </div>
          ) : result?.status === "succeeded" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 size={20} />
                <span className="font-semibold">Completed</span>
              </div>
              <OutputDisplay value={result.output} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-red-500">
                <XCircle size={20} />
                <span className="font-semibold">
                  {result?.status === "cancelled" ? "Cancelled" : "Failed"}
                </span>
              </div>
              {result?.error && (
                <div className="bg-red-50 text-red-700 rounded-[10px] p-4 text-sm">
                  {result.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutputDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-[var(--muted-foreground)]">(no output)</p>;
  }

  if (typeof value === "string") {
    if (isImageValue(value)) {
      return (
        <img
          src={value}
          alt="Output"
          className="rounded-[10px] max-w-full max-h-[400px] object-contain"
        />
      );
    }
    if (isAudioValue(value)) {
      return <audio controls src={value} className="w-full" />;
    }
    return (
      <pre className="bg-[var(--surface-2)] rounded-[10px] p-4 text-sm whitespace-pre-wrap max-h-80 overflow-auto">
        {value}
      </pre>
    );
  }

  return (
    <pre className="bg-[var(--surface-2)] rounded-[10px] p-4 text-sm whitespace-pre-wrap max-h-80 overflow-auto">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
