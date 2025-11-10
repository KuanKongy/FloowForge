"use client";

import { use, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { Run, RunEvent } from "@flowforge/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


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


function groupRunStatusByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countRunStatusByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

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

