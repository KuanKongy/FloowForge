"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { apiGet } from "@/lib/api";


const runworkerTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveRunWorkerTone(status: string | undefined): keyof typeof runworkerTone {
  if (status && status in runworkerTone) return status as keyof typeof runworkerTone;
  return 'queued';
}

export type RunRow = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
  trigger_kind?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  error?: string | null;
};

/**
 * Right-edge floating panel listing recent runs for the current flow. Mirrors
 * Gumloop's "Runs" sidebar: pick a row and the editor switches its
 * RunSidebar to display that run's per-node states + IO modal.
 *
 * Polling is intentionally simple - we refetch on open + on demand. Live
 * updates for the *active* run are still delivered through the realtime
 * broadcast channel in EditorClient.
 */
export function RunHistoryPanel({
  flowId,
  activeRunId,
  onSelect,
  onClose,
}: {
  flowId: string;
  activeRunId: string | null;
  onSelect: (runId: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<RunRow[]>(`/runs?flow_id=${encodeURIComponent(flowId)}`);
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  return (
    <aside
      className="run-sidebar pointer-events-auto"
      aria-label="Run history"
      // Sits directly under the right floating pill (Save / Add / Run /
      // History) so clicking History reads as "panel descends from this
      // button". 80px clears the pill height + the page's 16px top padding.
      style={{ top: 80, right: 16, width: 320 }}
    >
      <header className="run-sidebar__header">
        <span className="font-semibold text-sm">Runs</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh runs"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors p-1 rounded-md hover:bg-[var(--muted)]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close runs panel"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors p-1 rounded-md hover:bg-[var(--muted)]"
          >
            <X size={16} />
          </button>
        </span>
      </header>
      {error && (
        <div className="px-4 py-3 text-xs text-[#b91c1c]">Could not load runs: {error}</div>
      )}
      {!error && !loading && rows.length === 0 && (
        <div className="px-4 py-6 text-xs text-[var(--muted-foreground)]">
          No runs yet for this flow. Hit Run to create one.
        </div>
      )}
      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={`run-sidebar__row w-full text-left ${
            r.id === activeRunId ? "bg-[var(--secondary)]" : ""
          }`}
          aria-pressed={r.id === activeRunId}
        >
          <span className={`run-sidebar__chip run-sidebar__chip--${r.status}`}>
            <span className="size-2 rounded-full bg-current" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {(r.trigger_kind || "manual").replace("_", " ")}
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] truncate">
              {formatTime(r.created_at)} · {r.status}
            </div>
          </div>
          {r.ended_at && r.created_at && (
            <span className="run-sidebar__time">{formatDuration(r.created_at, r.ended_at)}</span>
          )}
        </button>
      ))}
    </aside>
  );
}


function moveRunSchemaItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeRunSchemaItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}


function buildRunLayoutSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterRunLayoutRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildRunLayoutSearchText(record).includes(needle));
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m`;
}

type RunPanelRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readRunPanelLabel(record: RunPanelRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortRunPanelRecords(records: RunPanelRecord[]): RunPanelRecord[] {
  return records.slice().sort((a, b) => readRunPanelLabel(a).localeCompare(readRunPanelLabel(b)));
}

