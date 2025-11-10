"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { Run } from "@flowforge/shared";

const STATUS_TONE: Record<Run["status"], { bg: string; fg: string; dot: string }> = {
  queued: { bg: "var(--muted)", fg: "var(--muted-foreground)", dot: "#9ca3af" },
  running: { bg: "rgba(var(--audio__background-rgb), 1)", fg: "rgba(var(--audio__font-rgb), 1)", dot: "var(--audio__font)" },
  succeeded: { bg: "rgba(var(--image__background-rgb), 1)", fg: "rgba(var(--image__font-rgb), 1)", dot: "var(--image__font)" },
  failed: { bg: "#fee2e2", fg: "#b91c1c", dot: "#ef4444" },
  cancelled: { bg: "var(--primary-grey)", fg: "var(--muted-foreground)", dot: "#6b7280" },
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Run[]>("/runs")
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Runs</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">All run history across your flows.</p>

      {loading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="card-surface p-10 text-center text-[var(--muted-foreground)]">
          No runs yet. Trigger a flow to see history here.
        </div>
      ) : (
        <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
          {runs.map((run) => {
            const tone = STATUS_TONE[run.status];
            return (
              <Link
                key={run.id}
                href={`/app/runs/${run.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-[var(--muted)]"
              >
                <div className="flex items-center gap-3">
                  <span className="size-2 rounded-full" style={{ background: tone.dot }} />
                  <div>
                    <div className="font-medium text-sm">Run {run.id.slice(0, 8)}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Flow {run.flow_id.slice(0, 8)} · {run.trigger_kind}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="pill" style={{ background: tone.bg, color: tone.fg }}>
                    {run.status}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {run.started_at ? new Date(run.started_at).toLocaleString() : "queued"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
