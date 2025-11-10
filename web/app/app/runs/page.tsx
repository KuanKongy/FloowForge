"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { Run } from "@flowforge/shared";


type RunHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readRunHistoryLabel(record: RunHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortRunHistoryRecords(records: RunHistoryRecord[]): RunHistoryRecord[] {
  return records.slice().sort((a, b) => readRunHistoryLabel(a).localeCompare(readRunHistoryLabel(b)));
}


function moveRunStorageItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeRunStorageItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

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

const rundetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveRunDetailTone(status: string | undefined): keyof typeof rundetailTone {
  if (status && status in rundetailTone) return status as keyof typeof rundetailTone;
  return 'queued';
}


function buildRunSearchSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterRunSearchRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildRunSearchSearchText(record).includes(needle));
}


function pickRunPayloadChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeRunPayloadPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

