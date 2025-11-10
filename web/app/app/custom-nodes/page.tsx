"use client";

import { useEffect, useState } from "react";
import { Plus, Boxes, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { CustomNode } from "@flowforge/shared";


function groupCustomNodeQueueByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countCustomNodeQueueByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export default function CustomNodesPage() {
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomNode | null>(null);
  const [editing, setEditing] = useState<CustomNode | null>(null);

  async function refresh() {
    setNodes(await apiGet<CustomNode[]>("/custom-nodes"));
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Custom Nodes</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-2xl">
            Custom nodes are <strong>AI-driven building blocks you author once
            and reuse</strong>. Give the AI a set of <strong>instructions</strong>{" "}
            (system prompt, tone, format) — or paste a <strong>code snippet</strong>{" "}
            and let the AI run it on each input — and the result becomes a
            drop-in node on the canvas. Define inputs / outputs once and any
            flow can wire it up.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> New custom node
        </Button>
      </div>

      {showNew && (
        <PromptTemplateBuilder
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nodes.map((n) => (
          <div key={n.id} className="card-surface p-5 group flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="rounded-[8px] p-1.5"
                style={{
                  backgroundColor: "rgba(var(--text__background-rgb), 1)",
                  color: "rgba(var(--text__font-rgb), 1)",
                }}
              >
                <Boxes size={16} />
              </div>
              <span className="pill bg-[var(--secondary)] text-[var(--primary)]">{n.kind}</span>
            </div>
            <h3 className="font-semibold">{n.name}</h3>
            <div className="text-xs text-[var(--muted-foreground)] mt-2 flex-1">
              {n.schema.inputs?.length ?? 0} inputs · {n.schema.outputs?.length ?? 0} outputs
            </div>
            <div className="flex justify-end items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditing(n)}
                className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--secondary)]"
                aria-label="View / edit"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(n)}
                className="text-[var(--muted-foreground)] hover:text-red-500 transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="card-surface p-10 text-center text-[var(--muted-foreground)] md:col-span-2 lg:col-span-3">
            No custom nodes yet.
          </div>
        )}
      </div>

      {editing && (
        <CustomNodeEditor
          node={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        description="This removes the custom node. Flows that reference it will fail until you replace or restore it."
        confirmLabel="Delete"
        onConfirm={async () => {
          const n = pendingDelete;
          if (!n) return;
          setPendingDelete(null);
          await apiDelete(`/custom-nodes/${n.id}`);
          await refresh();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}


function pickCustomNodeSessionChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeCustomNodeSessionPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

function CustomNodeEditor({
  node,
  onClose,
  onSaved,
}: {
  node: CustomNode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [prompt, setPrompt] = useState((node.body as { prompt?: string }).prompt || "");
  const [model, setModel] = useState((node.body as { model?: string }).model || "GPT-4o-mini");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiPatch(`/custom-nodes/${node.id}`, {
        name,
        body: { ...(node.body as Record<string, unknown>), prompt, model },
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="card-surface w-[min(640px,100%)] flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="font-semibold">Edit custom node</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </header>
        <div className="overflow-auto p-5 flex flex-col gap-3">
          <Field label="Name">
            <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Default model">
            <select className={fieldCls} value={model} onChange={(e) => setModel(e.target.value)}>
              <option>GPT-4o-mini</option>
              <option>GPT o3-mini</option>
              <option>Gemini 2.5 Flash</option>
              <option>Llama 3 (Cloudflare)</option>
            </select>
          </Field>
          <Field label="Prompt template / instructions">
            <textarea
              className={`${fieldCls} h-40 py-2 leading-snug`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="System prompt + how the AI should transform inputs into outputs."
            />
          </Field>
          <div className="text-xs text-[var(--muted-foreground)]">
            Inputs: {node.schema.inputs.map((i) => i.name).join(", ") || "—"}
            <br />
            Outputs: {node.schema.outputs.map((o) => o.name).join(", ") || "—"}
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </footer>
      </div>
    </div>
  );
}


function moveCustomNodePaletteItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeCustomNodePaletteItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function PromptTemplateBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("My prompt node");
  const [inputs, setInputs] = useState("topic, audience");
  const [outputs, setOutputs] = useState("text");
  const [model, setModel] = useState("GPT o3-mini");
  const [prompt, setPrompt] = useState(
    "Write a short summary about {{topic}} for {{audience}}."
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const inputList = inputs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => ({ name: n, type: "text" as const }));
    const outputList = outputs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => ({ name: n, type: "text" as const }));
    await apiPost("/custom-nodes", {
      kind: "prompt_template",
      name,
      schema: { inputs: inputList, outputs: outputList },
      body: { prompt, model, params: {} },
    });
    setBusy(false);
    onCreated();
  }

  return (
    <div className="card-surface p-5 mb-6">
      <h3 className="font-semibold mb-3">New prompt template</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Model">
          <select className={fieldCls} value={model} onChange={(e) => setModel(e.target.value)}>
            <option>GPT o3-mini</option>
            <option>Gemini</option>
            <option>Llama 3 (Cloudflare)</option>
          </select>
        </Field>
        <Field label="Inputs (comma separated)">
          <input className={fieldCls} value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </Field>
        <Field label="Outputs (comma separated)">
          <input className={fieldCls} value={outputs} onChange={(e) => setOutputs(e.target.value)} />
        </Field>
      </div>
      <Field label="Prompt template">
        <textarea
          className={`${fieldCls} h-32 py-2 leading-snug`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}


function buildCustomNodeProviderSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterCustomNodeProviderRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildCustomNodeProviderSearchText(record).includes(needle));
}

const fieldCls =
  "h-9 w-full px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm";


type CustomNodeTriggerRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readCustomNodeTriggerLabel(record: CustomNodeTriggerRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortCustomNodeTriggerRecords(records: CustomNodeTriggerRecord[]): CustomNodeTriggerRecord[] {
  return records.slice().sort((a, b) => readCustomNodeTriggerLabel(a).localeCompare(readCustomNodeTriggerLabel(b)));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm mt-3 first:mt-0">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      {children}
    </label>
  );
}

const customnodemediaTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveCustomNodeMediaTone(status: string | undefined): keyof typeof customnodemediaTone {
  if (status && status in customnodemediaTone) return status as keyof typeof customnodemediaTone;
  return 'queued';
}


const customnoderoutingTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveCustomNodeRoutingTone(status: string | undefined): keyof typeof customnoderoutingTone {
  if (status && status in customnoderoutingTone) return status as keyof typeof customnoderoutingTone;
  return 'queued';
}

