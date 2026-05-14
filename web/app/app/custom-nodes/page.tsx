"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { CustomNode, IoType } from "@flowforge/shared";

type InputRow = { name: string; type: IoType; required: boolean; default?: string };

const TYPE_OPTIONS: IoType[] = ["text", "json", "file", "image", "audio"];
const fieldCls =
  "h-9 w-full px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm";

export default function CustomNodesPage() {
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<CustomNode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomNode | null>(null);

  async function refresh() {
    setNodes(await apiGet<CustomNode[]>("/custom-nodes?kind=prompt_template"));
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Custom Nodes</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-3xl">
            Build reusable prompt nodes to broaden the capabilities of your workflows. A custom node has many inputs
            and one output. On the canvas, each connected parent node becomes an input variable using that
            parent&apos;s name, normalized like <span className="font-mono">Invoice Text</span> to{" "}
            <span className="font-mono">{"{{invoice_text}}"}</span>.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> New custom node
        </Button>
      </div>

      <div className="card-surface p-4 mb-6 flex items-start gap-3">
        <CheckCircle2 size={18} className="text-[var(--primary)] mt-0.5 shrink-0" />
        <div className="text-sm text-[var(--muted-foreground)]">
          FloowForge does not have named output handles yet. The practical version is simpler:
          rename upstream nodes clearly, then reference those names in your prompt. The custom node still
          emits one output that downstream nodes can use normally.
        </div>
      </div>

      {showNew && (
        <CustomNodeForm
          mode="create"
          onClose={() => setShowNew(false)}
          onSaved={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nodes.map((n) => (
          <div key={n.id} className="card-surface p-5 flex flex-col">
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
              <span className="pill bg-[var(--secondary)] text-[var(--primary)]">prompt</span>
            </div>
            <h3 className="font-semibold">{n.name}</h3>
            <div className="text-xs text-[var(--muted-foreground)] mt-2 flex-1">
              {(n.schema.inputs || []).map((i) => normalizeVar(i.name)).join(", ") || "No inputs"} · one output
            </div>
            <div className="flex justify-end items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditing(n)}
                className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--secondary)]"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(n)}
                className="text-[var(--muted-foreground)] hover:text-red-500 transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-red-50"
              >
                <Trash2 size={14} /> Delete
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
        <CustomNodeForm
          mode="edit"
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
        description="Flows that reference this custom node will fail until you replace or restore it."
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

function CustomNodeForm({
  mode,
  node,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  node?: CustomNode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(node?.name || "Extract invoice fields");
  const [model, setModel] = useState((node?.body as { model?: string } | undefined)?.model || "GPT-4o-mini");
  const [inputs, setInputs] = useState<InputRow[]>(
    (node?.schema.inputs || [
      { name: "Invoice Text", type: "text", required: true, default: "" },
      { name: "Output Format", type: "text", required: false, default: "JSON" },
    ]) as InputRow[]
  );
  const [outputName, setOutputName] = useState(node?.schema.outputs?.[0]?.name || "output");
  const [prompt, setPrompt] = useState(
    (node?.body as { prompt?: string } | undefined)?.prompt ||
      "Extract the invoice data from {{invoice_text}} and return {{output_format}}."
  );
  const [busy, setBusy] = useState(false);

  const allowedVars = useMemo(() => new Set(inputs.map((i) => normalizeVar(i.name)).filter(Boolean)), [inputs]);
  const usedVars = useMemo(() => Array.from(prompt.matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)).map((m) => m[1]), [prompt]);
  const missingVars = usedVars.filter((v) => !allowedVars.has(v));
  const unusedVars = Array.from(allowedVars).filter((v) => !usedVars.includes(v));

  function updateInput(index: number, patch: Partial<InputRow>) {
    setInputs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setBusy(true);
    try {
      const schema = {
        inputs: inputs
          .map((i) => ({ ...i, name: i.name.trim() }))
          .filter((i) => i.name)
          .map((i) => ({ name: i.name, type: i.type, required: i.required, default: i.default })),
        outputs: [{ name: outputName.trim() || "output", type: "text" as const }],
      };
      const body = { prompt, model, params: {} };
      if (mode === "edit" && node) {
        await apiPatch(`/custom-nodes/${node.id}`, { name, schema, body });
      } else {
        await apiPost("/custom-nodes", { kind: "prompt_template", name, schema, body });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div className="card-surface p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{mode === "edit" ? "Edit custom node" : "New custom node"}</h3>
          {mode === "edit" && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Editing updates future runs that use this custom node. Existing run history stays unchanged.
            </p>
          )}
        </div>
        {mode === "edit" && <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 mt-3">
        <Field label="Name">
          <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Model">
          <select className={fieldCls} value={model} onChange={(e) => setModel(e.target.value)}>
            <option>GPT-4o-mini</option>
            <option>GPT o3-mini</option>
            <option>Gemini 2.5 Flash</option>
            <option>Gemini 2.5 Flash Lite</option>
            <option>DeepSeek V4 Flash</option>
            <option>Llama 3 (Cloudflare)</option>
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Inputs</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputs([...inputs, { name: "New Input", type: "text", required: false, default: "" }])}
          >
            <Plus size={14} /> Add input
          </Button>
        </div>
        <div className="border border-[var(--border)] rounded-[10px] overflow-hidden">
          {inputs.map((row, i) => (
            <div key={i} className="grid grid-cols-[1.3fr_110px_90px_1fr_40px] gap-2 p-2 border-b last:border-b-0 border-[var(--border)]">
              <input className={fieldCls} value={row.name} onChange={(e) => updateInput(i, { name: e.target.value })} />
              <select className={fieldCls} value={row.type} onChange={(e) => updateInput(i, { type: e.target.value as IoType })}>
                {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <label className="h-9 flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
                <input type="checkbox" checked={row.required} onChange={(e) => updateInput(i, { required: e.target.checked })} />
                Required
              </label>
              <input className={fieldCls} value={row.default || ""} placeholder="Default" onChange={(e) => updateInput(i, { default: e.target.value })} />
              <button className="rounded-[10px] hover:bg-red-50 text-[var(--muted-foreground)] hover:text-red-500" onClick={() => setInputs(inputs.filter((_, idx) => idx !== i))} aria-label="Remove input">
                <Trash2 size={15} className="mx-auto" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Single output name">
        <input className={fieldCls} value={outputName} onChange={(e) => setOutputName(e.target.value)} />
      </Field>

      <Field label="Prompt template">
        <textarea className={`${fieldCls} min-h-36 py-2 leading-snug`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <InfoBox title="Available variables" tone="ok">
          {Array.from(allowedVars).map((v) => `{{${v}}}`).join(", ") || "Add inputs to create variables."}
        </InfoBox>
        <InfoBox title={missingVars.length ? "Fix before saving" : "Validation"} tone={missingVars.length ? "warn" : "ok"}>
          {missingVars.length
            ? `Unknown variables: ${missingVars.map((v) => `{{${v}}}`).join(", ")}`
            : unusedVars.length
            ? `Unused inputs: ${unusedVars.join(", ")}`
            : "Prompt variables match the input schema."}
        </InfoBox>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy || missingVars.length > 0}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );

  if (mode === "edit") {
    return (
      <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
        <div className="w-[min(920px,100%)] max-h-[86vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }
  return content;
}

function normalizeVar(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function InfoBox({ title, tone, children }: { title: string; tone: "ok" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : CheckCircle2;
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
      <div className={`flex items-center gap-2 font-semibold ${tone === "warn" ? "text-[#b45309]" : "text-[var(--primary)]"}`}>
        <Icon size={14} /> {title}
      </div>
      <div className="mt-1 text-[var(--muted-foreground)] break-words">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm mt-3">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      {children}
    </label>
  );
}
