"use client";

import { useEffect, useState } from "react";
import { Plus, Webhook, CalendarClock, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { Flow, Trigger } from "@flowforge/shared";


type TriggerHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readTriggerHistoryLabel(record: TriggerHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortTriggerHistoryRecords(records: TriggerHistoryRecord[]): TriggerHistoryRecord[] {
  return records.slice().sort((a, b) => readTriggerHistoryLabel(a).localeCompare(readTriggerHistoryLabel(b)));
}

type WebhookSecret = { token: string; secret: string };


const triggerdetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveTriggerDetailTone(status: string | undefined): keyof typeof triggerdetailTone {
  if (status && status in triggerdetailTone) return status as keyof typeof triggerdetailTone;
  return 'queued';
}

type TriggerWithWebhook = Trigger & { webhook_secrets?: WebhookSecret[] };

export default function TriggersPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [triggers, setTriggers] = useState<TriggerWithWebhook[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TriggerWithWebhook | null>(null);

  async function refresh() {
    const [f, t] = await Promise.all([
      apiGet<Flow[]>("/flows"),
      apiGet<TriggerWithWebhook[]>("/triggers"),
    ]);
    setFlows(f);
    setTriggers(t);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggleActive(t: TriggerWithWebhook) {
    await apiPatch(`/triggers/${t.id}`, { is_active: !t.is_active });
    await refresh();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Triggers</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Run your flows on a schedule or via public webhook.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> New trigger
        </Button>
      </div>

      {showNew && (
        <NewTriggerCard
          flows={flows}
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      )}

      <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
        {triggers.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--muted-foreground)]">
            No triggers yet.
          </div>
        ) : (
          triggers.map((t) => (
            <TriggerRow
              key={t.id}
              trigger={t}
              flow={flows.find((f) => f.id === t.flow_id)}
              onToggle={() => toggleActive(t)}
              onDelete={() => setPendingDelete(t)}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete trigger?"
        description={
          pendingDelete?.kind === "webhook"
            ? "Anyone holding this webhook URL will start getting 404s."
            : "The schedule will stop running."
        }
        confirmLabel="Delete trigger"
        onConfirm={async () => {
          const t = pendingDelete;
          if (!t) return;
          setPendingDelete(null);
          await apiDelete(`/triggers/${t.id}`);
          await refresh();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}


function groupTriggerBrowserByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countTriggerBrowserByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function NewTriggerCard({
  flows,
  onClose,
  onCreated,
}: {
  flows: Flow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [flowId, setFlowId] = useState(flows[0]?.id || "");
  const [kind, setKind] = useState<"webhook" | "schedule">("webhook");
  const [cron, setCron] = useState("0 9 * * *");
  const [tz, setTz] = useState("UTC");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!flowId) return;
    setBusy(true);
    const config = kind === "schedule" ? { cron, timezone: tz } : {};
    await apiPost("/triggers", { flow_id: flowId, kind, config });
    setBusy(false);
    onCreated();
  }

  return (
    <div className="card-surface p-5 mb-6">
      <h3 className="font-semibold mb-3">New trigger</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Flow
          <select
            value={flowId}
            onChange={(e) => setFlowId(e.target.value)}
            className="h-9 px-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "webhook" | "schedule")}
            className="h-9 px-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
          >
            <option value="webhook">Webhook</option>
            <option value="schedule">Schedule</option>
          </select>
        </label>
        {kind === "schedule" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Cron
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                className="h-9 px-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
                placeholder="0 9 * * *"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Timezone
              <input
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="h-9 px-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
                placeholder="UTC"
              />
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}


function moveTriggerStorageItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeTriggerStorageItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function TriggerRow({
  trigger,
  flow,
  onToggle,
  onDelete,
}: {
  trigger: TriggerWithWebhook;
  flow?: Flow;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const ws = trigger.webhook_secrets?.[0];
  const url = ws ? `${apiBase}/t/webhook/${ws.token}` : null;

  function copyUrl() {
    if (url) navigator.clipboard.writeText(url);
  }

  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {trigger.kind === "webhook" ? <Webhook size={18} /> : <CalendarClock size={18} />}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">
            {flow?.name || trigger.flow_id.slice(0, 8)}
          </div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">
            {trigger.kind === "schedule"
              ? `cron: ${(trigger.config.cron as string) || ""}`
              : url || "webhook"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Active / paused toggle. Pausing a schedule unhooks it from
            APScheduler; pausing a webhook makes the public URL return 404. */}
        <button
          type="button"
          onClick={onToggle}
          className={`pill ${
            trigger.is_active
              ? "bg-[var(--secondary)] text-[var(--primary)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          } cursor-pointer hover:brightness-95 transition-[filter]`}
          aria-pressed={trigger.is_active}
        >
          {trigger.is_active ? "Active" : "Paused"}
        </button>
        {url && (
          <Button variant="outline" size="sm" onClick={copyUrl}>
            <Copy size={14} /> Copy URL
          </Button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50 transition-colors px-2 py-1 rounded-md flex items-center gap-1 text-xs"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}

function buildTriggerSearchSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterTriggerSearchRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildTriggerSearchSearchText(record).includes(needle));
}

