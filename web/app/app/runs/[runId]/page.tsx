"use client";

import { use, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { Run, RunEvent } from "@flowforge/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    apiGet<{ run: Run; events: RunEvent[] }>(`/runs/${runId}`).then((r) => {
      setRun(r.run);
      setEvents(r.events);
    });
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`run:${runId}`);
    channel.on("broadcast", { event: "*" }, ({ event, payload }: { event: string; payload: unknown }) => {
      setEvents((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          run_id: runId,
          node_id: (payload as { node_id?: string | null }).node_id ?? null,
          kind: event as RunEvent["kind"],
          payload: (payload as { payload?: Record<string, unknown> }).payload ?? {},
          duration_ms: (payload as { duration_ms?: number | null }).duration_ms ?? null,
          ts: new Date().toISOString(),
        },
      ]);
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Run {runId.slice(0, 8)}</h1>
      {run && (
        <div className="text-sm text-[var(--muted-foreground)] mb-6">
          {run.trigger_kind} · {run.status}
        </div>
      )}
      <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
        {events.map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-start gap-3">
            <span className="text-xs text-[var(--muted-foreground)] font-mono w-[80px]">
              {new Date(e.ts).toLocaleTimeString()}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">
                {e.kind} {e.node_id ? `· ${e.node_id.slice(0, 8)}` : ""}
              </div>
              {Object.keys(e.payload || {}).length > 0 && (
                <pre className="text-xs text-[var(--muted-foreground)] mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="px-5 py-10 text-center text-[var(--muted-foreground)]">
            Waiting for events…
          </div>
        )}
      </div>
    </div>
  );
}
