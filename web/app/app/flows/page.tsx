"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Flow } from "@flowforge/shared";


function groupFlowQueueByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countFlowQueueByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}


type FlowCanvasRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readFlowCanvasLabel(record: FlowCanvasRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortFlowCanvasRecords(records: FlowCanvasRecord[]): FlowCanvasRecord[] {
  return records.slice().sort((a, b) => readFlowCanvasLabel(a).localeCompare(readFlowCanvasLabel(b)));
}


function moveFlowOutputItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeFlowOutputItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Flow | null>(null);
  const router = useRouter();

  useEffect(() => {
    setListError(null);
    apiGet<Flow[]>("/flows")
      .then(setFlows)
      .catch((e: unknown) => {
        setFlows([]);
        setListError(e instanceof Error ? e.message : "Could not load flows");
      })
      .finally(() => setLoading(false));
  }, []);

  async function createFlow() {
    setCreateError(null);
    setCreating(true);
    try {
      const flow = await apiPost<Flow>("/flows", { name: "Untitled flow" });
      router.push(`/app/flows/${flow.id}`);
    } catch (e: unknown) {
      setCreateError(
        e instanceof Error ? e.message : "Could not create flow. Is the API running (NEXT_PUBLIC_API_URL)?"
      );
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    const flow = pendingDelete;
    if (!flow) return;
    setPendingDelete(null);
    try {
      await apiDelete(`/flows/${flow.id}`);
      setFlows((fs) => fs.filter((f) => f.id !== flow.id));
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to delete flow");
    }
  }

  const filtered = flows.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Flows</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Your saved workflows and subflows.
          </p>
        </div>
        <Button onClick={createFlow} disabled={creating}>
          <Plus size={16} /> {creating ? "Creating…" : "New flow"}
        </Button>
      </div>

      {listError && (
        <div className="text-sm text-red-500 mb-4" role="alert">
          {listError}
        </div>
      )}
      {createError && (
        <div className="text-sm text-red-500 mb-4" role="alert">
          {createError}
        </div>
      )}

      <div className="card-surface px-3 flex items-center gap-2 mb-6 h-10">
        <Search size={16} className="text-[var(--muted-foreground)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search flows…"
          className="flex-1 bg-transparent focus:outline-none text-sm"
        />
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <Workflow size={42} className="mx-auto text-[var(--font--light)]" />
          <h2 className="font-semibold text-lg mt-3">No flows yet</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Create your first flow to start building.
          </p>
          <Button onClick={createFlow} disabled={creating} className="mt-5">
            <Plus size={16} /> {creating ? "Creating…" : "New flow"}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        description="This removes the flow and all its run history. This action cannot be undone."
        confirmLabel="Delete flow"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((flow) => (
            <div key={flow.id} className="card-surface p-5 group flex flex-col">
              <Link href={`/app/flows/${flow.id}`} prefetch className="block flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="rounded-[8px] p-1.5"
                    style={{
                      backgroundColor: "rgba(var(--text__background-rgb), 1)",
                      color: "rgba(var(--text__font-rgb), 1)",
                    }}
                  >
                    <Workflow size={16} />
                  </div>
                  {flow.is_subflow && (
                    <span className="pill bg-[var(--secondary)] text-[var(--primary)]">Subflow</span>
                  )}
                </div>
                <h3 className="font-semibold">{flow.name}</h3>
                {flow.description && (
                  <p className="text-sm text-[var(--muted-foreground)] mt-1 line-clamp-2">
                    {flow.description}
                  </p>
                )}
              </Link>
              {/* Footer row pinned **inside** the card with the date on the
                  left and a delete chip on the right — no clipping above
                  the card edge. */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Updated {new Date(flow.updated_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPendingDelete(flow);
                  }}
                  className="text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-red-50"
                  aria-label={`Delete flow ${flow.name}`}
                  title="Delete flow"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pickFlowSessionChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeFlowSessionPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}


const flowroutingTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveFlowRoutingTone(status: string | undefined): keyof typeof flowroutingTone {
  if (status && status in flowroutingTone) return status as keyof typeof flowroutingTone;
  return 'queued';
}


function buildFlowSelectionSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterFlowSelectionRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildFlowSelectionSearchText(record).includes(needle));
}

