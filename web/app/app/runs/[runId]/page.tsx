"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiDelete, apiGet } from "@/lib/api";
import type { Run, RunEvent } from "@flowforge/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Run {runId.slice(0, 8)}</h1>
          {run && (
            <div className="text-sm text-[var(--muted-foreground)]">
              {run.trigger_kind} · {run.status}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} /> Delete run
        </Button>
      </div>
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
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete run ${runId.slice(0, 8)}?`}
        description="This removes the run and its node execution events. The workflow itself will not be deleted."
        confirmLabel="Delete run"
        onConfirm={async () => {
          await apiDelete(`/runs/${runId}`);
          router.push("/app/runs");
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
