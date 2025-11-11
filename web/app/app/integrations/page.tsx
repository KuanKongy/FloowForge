"use client";

import { useEffect, useState } from "react";
import { Plus, KeyRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { Integration } from "@flowforge/shared";

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Integration | null>(null);
  const [editing, setEditing] = useState<Integration | null>(null);

  async function refresh() {
    setItems(await apiGet<Integration[]>("/integrations"));
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-2xl">
            <strong>Bring your own AI keys.</strong> Save an OpenAI / Gemini /
            Cloudflare / Anthropic API key here and your flows will use it
            instead of the platform default — that lets you pick newer or
            paid models the platform does not ship by default (e.g. GPT-5.4,
            Claude Sonnet, custom Cloudflare Workers AI models). Keys are
            encrypted at rest and only the metadata (label, provider) is
            shown back.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> Connect
        </Button>
      </div>

      {showNew && (
        <NewIntegrationCard
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await refresh();
          }}
        />
      )}

      <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--muted-foreground)]">
            No integrations yet.
          </div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="px-5 py-4 flex items-center justify-between gap-3 group">
              <div className="flex items-center gap-3 min-w-0">
                <KeyRound size={18} className="text-[var(--muted-foreground)]" />
                <div className="min-w-0">
                  <div className="font-medium text-sm capitalize">
                    {it.provider}
                    <span className="text-[var(--muted-foreground)] font-normal ml-2">
                      {it.label || "default"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    Key on file • used automatically when a flow runs
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(it)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--secondary)] transition-colors px-2 py-1 rounded-md flex items-center gap-1 text-xs"
                  aria-label="Rename"
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(it)}
                  className="text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50 transition-colors px-2 py-1 rounded-md flex items-center gap-1 text-xs"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <RenameIntegrationDialog
          integration={editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.provider ?? ""} integration?`}
        description="Flows that depended on this key will fall back to the platform default."
        confirmLabel="Delete"
        onConfirm={async () => {
          const it = pendingDelete;
          if (!it) return;
          setPendingDelete(null);
          await apiDelete(`/integrations/${it.id}`);
          await refresh();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function RenameIntegrationDialog({
  integration,
  onCancel,
  onSaved,
}: {
  integration: Integration;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(integration.label || "default");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiPatch(`/integrations/${integration.id}`, { label });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="card-surface w-[min(420px,100%)]" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold capitalize">Rename {integration.provider} integration</h2>
        </header>
        <div className="p-5">
          <label className="flex flex-col gap-1 text-sm">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
            />
          </label>
        </div>
        <footer className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </footer>
      </div>
    </div>
  );
}

function NewIntegrationCard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [provider, setProvider] = useState<"openai" | "gemini" | "cloudflare">("openai");
  const [label, setLabel] = useState("default");
  const [key, setKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const credentials: Record<string, string> = { api_key: key };
    if (provider === "cloudflare") credentials.account_id = accountId;
    await apiPost("/integrations", { provider, label, credentials });
    setBusy(false);
    onCreated();
  }

  return (
    <div className="card-surface p-5 mb-6 grid gap-3 md:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        Provider
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "openai" | "gemini" | "cloudflare")}
          className="h-9 px-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="cloudflare">Cloudflare</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm md:col-span-2">
        API key
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
        />
      </label>
      {provider === "cloudflare" && (
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Cloudflare account ID
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]"
          />
        </label>
      )}
      <div className="flex justify-end gap-2 md:col-span-2">
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
