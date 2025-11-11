"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Pencil,
  Plus,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { Flow, Trigger } from "@flowforge/shared";

type WebhookSecret = { token: string; secret: string };
type TriggerWithWebhook = Trigger & {
  webhook_secrets?: WebhookSecret[];
  webhook?: { url: string; token: string; secret: string };
};
type EntryNode = { id: string; type: string; name: string };
type SinkNode = { id: string; type: string; name: string };
type InputField = { id: string; type: string; name: string; default_value: unknown };

const TRIGGER_KINDS = [
  { kind: "incoming_webhook", label: "Incoming Webhook", desc: "Receive a POST to start the workflow", icon: <Webhook size={20} /> },
  { kind: "outgoing_webhook", label: "Outgoing Webhook", desc: "POST results to an external URL when done", icon: <Send size={20} /> },
  { kind: "schedule", label: "Schedule", desc: "Run on a time-based schedule", icon: <CalendarClock size={20} /> },
  { kind: "public_form", label: "Public Form", desc: "Share a form link for non-technical users", icon: <FileText size={20} /> },
] as const;

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const fieldCls = "h-9 w-full px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm";

export default function TriggersPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [triggers, setTriggers] = useState<TriggerWithWebhook[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [detailsTrigger, setDetailsTrigger] = useState<TriggerWithWebhook | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TriggerWithWebhook | null>(null);

  async function refresh() {
    const [f, t] = await Promise.all([
      apiGet<Flow[]>("/flows"),
      apiGet<TriggerWithWebhook[]>("/triggers"),
    ]);
    setFlows(f);
    setTriggers(t);
  }

  useEffect(() => { refresh(); }, []);

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
            Run your flows via webhook, schedule, or shareable public form.
          </p>
        </div>
        <Button onClick={() => { setShowNew(true); setDetailsTrigger(null); }}>
          <Plus size={16} /> New trigger
        </Button>
      </div>

      {showNew && (
        <CreateTriggerWizard
          flows={flows}
          onClose={() => setShowNew(false)}
          onCreated={async (created) => {
            setShowNew(false);
            await refresh();
            if (created) setDetailsTrigger(created);
          }}
        />
      )}

      {detailsTrigger && (
        <TriggerDetailsPanel
          trigger={detailsTrigger}
          flow={flows.find((f) => f.id === detailsTrigger.flow_id)}
          onClose={() => setDetailsTrigger(null)}
          onSaved={async () => {
            await refresh();
            const updated = (await apiGet<TriggerWithWebhook[]>("/triggers")).find(
              (t) => t.id === detailsTrigger.id
            );
            if (updated) setDetailsTrigger(updated);
            else setDetailsTrigger(null);
          }}
        />
      )}

      <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
        {triggers.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--muted-foreground)]">
            No triggers yet. Create one to automate your workflows.
          </div>
        ) : (
          triggers.map((t) => (
            <TriggerRow
              key={t.id}
              trigger={t}
              flow={flows.find((f) => f.id === t.flow_id)}
              onToggle={() => toggleActive(t)}
              onEdit={() => setDetailsTrigger(t)}
              onDelete={() => setPendingDelete(t)}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete trigger?"
        description="This trigger will be permanently removed. Webhook URLs will stop working."
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

/* ---------- Creation Wizard ---------- */

type WizardStep = "kind" | "configure";

function CreateTriggerWizard({
  flows,
  onClose,
  onCreated,
}: {
  flows: Flow[];
  onClose: () => void;
  onCreated: (created?: TriggerWithWebhook) => void;
}) {
  const [step, setStep] = useState<WizardStep>("kind");
  const [kind, setKind] = useState<string>("");
  const [flowId, setFlowId] = useState(flows[0]?.id || "");
  const [entryNodeId, setEntryNodeId] = useState("");
  const [entryNodes, setEntryNodes] = useState<EntryNode[]>([]);
  const [sinkNodes, setSinkNodes] = useState<SinkNode[]>([]);
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [inputModes, setInputModes] = useState<Record<string, "default" | "dynamic">>({});

  const [callbackUrl, setCallbackUrl] = useState("");
  const [showOutputs, setShowOutputs] = useState(false);
  const [outputNodeIds, setOutputNodeIds] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"cron" | "delay" | "daily" | "once">("cron");
  const [cron, setCron] = useState("0 9 * * *");
  const [delayHours, setDelayHours] = useState("1");
  const [dailyTime, setDailyTime] = useState("09:00");
  const [onceAt, setOnceAt] = useState("");
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!flowId || !kind) return;
    apiGet<EntryNode[]>(`/triggers/flow/${flowId}/entry-nodes?kind=${kind}`)
      .then((n) => {
        setEntryNodes(n);
        if (n.length === 1) setEntryNodeId(n[0].id);
        else setEntryNodeId("");
      })
      .catch(() => setEntryNodes([]));
    apiGet<SinkNode[]>(`/triggers/flow/${flowId}/sink-nodes`)
      .then(setSinkNodes)
      .catch(() => setSinkNodes([]));
  }, [flowId, kind]);

  useEffect(() => {
    if (!flowId || !entryNodeId) {
      setInputFields([]);
      return;
    }
    apiGet<InputField[]>(`/triggers/flow/${flowId}/entry-nodes/${entryNodeId}/inputs`)
      .then((fields) => {
        setInputFields(fields);
        const modes: Record<string, "default" | "dynamic"> = {};
        fields.forEach((f) => { modes[f.id] = "default"; });
        setInputModes(modes);
      })
      .catch(() => setInputFields([]));
  }, [flowId, entryNodeId]);

  function selectKind(k: string) {
    setKind(k);
    setStep("configure");
  }

  function buildCron(): string {
    if (scheduleMode === "cron") return cron;
    if (scheduleMode === "daily") {
      const [h, m] = dailyTime.split(":");
      return `${m || "0"} ${h || "9"} * * *`;
    }
    if (scheduleMode === "delay") return `in_${delayHours}h`;
    if (scheduleMode === "once" && onceAt) return `at_${onceAt}`;
    return cron;
  }

  async function submit() {
    if (!flowId) return;
    setBusy(true);
    try {
      const config: Record<string, unknown> = {};
      if (kind === "schedule") {
        config.cron = buildCron();
        config.timezone = tz;
        config.schedule_mode = scheduleMode;
      }
      config.input_modes = inputModes;
      const created = await apiPost<TriggerWithWebhook>("/triggers", {
        flow_id: flowId,
        kind,
        config,
        callback_url: kind === "outgoing_webhook" ? callbackUrl : undefined,
        entry_node_id: entryNodeId || undefined,
        show_outputs: showOutputs,
        output_node_ids: outputNodeIds.length ? outputNodeIds : undefined,
      });
      onCreated(created);
    } finally {
      setBusy(false);
    }
  }

  const needsEntryNode = kind !== "outgoing_webhook";

  return (
    <div className="card-surface p-5 mb-6">
      {step === "kind" && (
        <>
          <h3 className="font-semibold mb-4">Choose trigger type</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {TRIGGER_KINDS.map((tk) => (
              <button
                key={tk.kind}
                type="button"
                onClick={() => selectKind(tk.kind)}
                className="text-left p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--secondary)] transition-colors flex items-start gap-3"
              >
                <div className="text-[var(--primary)] mt-0.5">{tk.icon}</div>
                <div>
                  <div className="font-medium text-sm">{tk.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{tk.desc}</div>
                </div>
                <ChevronRight size={16} className="ml-auto mt-1 text-[var(--muted-foreground)]" />
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </>
      )}

      {step === "configure" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setStep("kind")} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors text-sm">
              &larr; Back
            </button>
            <h3 className="font-semibold">
              {TRIGGER_KINDS.find((t) => t.kind === kind)?.label}
            </h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Flow">
              <select className={fieldCls} value={flowId} onChange={(e) => setFlowId(e.target.value)}>
                {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>

            {needsEntryNode && entryNodes.length > 0 && (
              <Field label="Entry node">
                <select className={fieldCls} value={entryNodeId} onChange={(e) => setEntryNodeId(e.target.value)}>
                  {entryNodes.length > 1 && <option value="">Select entry point…</option>}
                  {entryNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
                  ))}
                </select>
              </Field>
            )}

            {needsEntryNode && entryNodes.length === 0 && flowId && (
              <div className="md:col-span-2 text-xs text-[var(--muted-foreground)] bg-[var(--surface-2)] rounded-lg p-3">
                No matching entry nodes found. Add a{" "}
                {kind === "incoming_webhook" ? "Webhook In" : kind === "schedule" ? "Schedule In" : "Manual In"}{" "}
                node to your flow first.
              </div>
            )}

            {kind === "outgoing_webhook" && (
              <Field label="Callback URL">
                <input className={fieldCls} value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://..." />
              </Field>
            )}

            {kind === "schedule" && (
              <>
                <Field label="Schedule type">
                  <select className={fieldCls} value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as typeof scheduleMode)}>
                    <option value="cron">Custom (cron expression)</option>
                    <option value="daily">Every day at a specific time</option>
                    <option value="delay">Run once, in X hours from now</option>
                    <option value="once">Run once, at a specific date and time</option>
                  </select>
                </Field>
                {scheduleMode === "cron" && (
                  <Field label="Cron expression">
                    <input className={fieldCls} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" />
                  </Field>
                )}
                {scheduleMode === "daily" && (
                  <Field label="Time">
                    <input type="time" className={fieldCls} value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
                  </Field>
                )}
                {scheduleMode === "delay" && (
                  <Field label="Hours from now">
                    <input type="number" min="1" className={fieldCls} value={delayHours} onChange={(e) => setDelayHours(e.target.value)} />
                  </Field>
                )}
                {scheduleMode === "once" && (
                  <Field label="Date and time">
                    <input type="datetime-local" className={fieldCls} value={onceAt} onChange={(e) => setOnceAt(e.target.value)} />
                  </Field>
                )}
                <Field label="Timezone">
                  <select className={fieldCls} value={tz} onChange={(e) => setTz(e.target.value)}>
                    {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </Field>
              </>
            )}

            {(kind === "public_form" || kind === "outgoing_webhook") && (
              <Field label="Show outputs">
                <label className="flex items-center gap-2 mt-1">
                  <input type="checkbox" checked={showOutputs} onChange={(e) => setShowOutputs(e.target.checked)} />
                  <span className="text-sm">{kind === "public_form" ? "Show results after submission" : "Include output in callback"}</span>
                </label>
              </Field>
            )}

            {showOutputs && sinkNodes.length > 0 && (
              <div className="md:col-span-2">
                <Field label="Output nodes to include">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {sinkNodes.map((n) => (
                      <label key={n.id} className="flex items-center gap-1.5 text-sm bg-[var(--surface-2)] rounded-lg px-2 py-1 border border-[var(--border)]">
                        <input
                          type="checkbox"
                          checked={outputNodeIds.includes(n.id)}
                          onChange={(e) => {
                            if (e.target.checked) setOutputNodeIds([...outputNodeIds, n.id]);
                            else setOutputNodeIds(outputNodeIds.filter((x) => x !== n.id));
                          }}
                        />
                        {n.name}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {inputFields.length > 0 && (
              <div className="md:col-span-2">
                <Field label="Input configuration">
                  <div className="space-y-2 mt-1">
                    {inputFields.map((f) => (
                      <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                        <span className="text-sm font-medium flex-1">{f.name} <span className="text-xs text-[var(--muted-foreground)]">({f.type})</span></span>
                        <select
                          className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-white"
                          value={inputModes[f.id] || "default"}
                          onChange={(e) => setInputModes({ ...inputModes, [f.id]: e.target.value as "default" | "dynamic" })}
                        >
                          <option value="default">
                            Use default{f.default_value ? ` ("${String(f.default_value).slice(0, 20)}${String(f.default_value).length > 20 ? "…" : ""}")` : " (empty)"}
                          </option>
                          <option value="dynamic">Allow user input</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Trigger Details Panel ---------- */

function TriggerDetailsPanel({
  trigger,
  flow,
  onClose,
  onSaved,
}: {
  trigger: TriggerWithWebhook;
  flow?: Flow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const ws = trigger.webhook_secrets?.[0];
  const webhookToken = ws?.token || trigger.webhook?.token;
  const webhookUrl = webhookToken ? `${apiBase}/t/webhook/${webhookToken}` : null;
  const formUrl = webhookToken && typeof window !== "undefined" ? `${window.location.origin}/p/${webhookToken}` : null;

  const [copied, setCopied] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState(trigger.callback_url || "");
  const [showOutputs, setShowOutputs] = useState(trigger.show_outputs || false);
  const [entryNodeId, setEntryNodeId] = useState(trigger.entry_node_id || "");
  const [entryNodes, setEntryNodes] = useState<EntryNode[]>([]);
  const [cron, setCron] = useState((trigger.config?.cron as string) || "0 9 * * *");
  const [tz, setTz] = useState((trigger.config?.timezone as string) || "UTC");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<EntryNode[]>(`/triggers/flow/${trigger.flow_id}/entry-nodes?kind=${trigger.kind}`)
      .then(setEntryNodes)
      .catch(() => setEntryNodes([]));
  }, [trigger.flow_id, trigger.kind]);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (trigger.kind === "outgoing_webhook") payload.callback_url = callbackUrl || null;
      payload.show_outputs = showOutputs;
      payload.entry_node_id = entryNodeId || null;
      if (trigger.kind === "schedule") {
        payload.config = { ...trigger.config, cron, timezone: tz };
      }
      await apiPatch(`/triggers/${trigger.id}`, payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const kindMeta = TRIGGER_KINDS.find((k) => k.kind === trigger.kind);

  return (
    <div className="card-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="text-[var(--primary)]">{kindMeta?.icon || <Globe size={20} />}</div>
          <h3 className="font-semibold">{kindMeta?.label || trigger.kind}</h3>
          <span className="pill bg-[var(--secondary)] text-[var(--primary)]">
            {flow?.name || trigger.flow_id.slice(0, 8)}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>

      {/* Webhook-specific details */}
      {(trigger.kind === "incoming_webhook" || trigger.kind === "webhook") && webhookUrl && (
        <div className="space-y-3 mb-4">
          <div>
            <div className="text-xs text-[var(--muted-foreground)] font-medium mb-1">POST URL</div>
            <div className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
              <code className="flex-1 text-xs truncate">{webhookUrl}</code>
              <button type="button" onClick={() => copyText(webhookUrl, "url")} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors">
                {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Example cURL</div>
            <div className="relative p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
              <pre className="text-[11px] whitespace-pre-wrap break-all">{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"input": {"key": "value"}}'`}</pre>
              <button
                type="button"
                onClick={() => copyText(`curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d '{"input": {"key": "value"}}'`, "curl")}
                className="absolute top-2 right-2 text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
              >
                {copied === "curl" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public form details */}
      {trigger.kind === "public_form" && formUrl && (
        <div className="space-y-3 mb-4">
          <div>
            <div className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Public Form URL</div>
            <div className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
              <code className="flex-1 text-xs truncate">{formUrl}</code>
              <button type="button" onClick={() => copyText(formUrl, "form")} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors">
                {copied === "form" ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors">
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Schedule details */}
      {trigger.kind === "schedule" && (
        <div className="space-y-3 mb-4">
          <div className="text-xs text-[var(--muted-foreground)]">
            Schedule: <span className="font-medium text-[var(--foreground)]">{trigger.config?.cron as string || "not set"}</span>
            {" "}({trigger.config?.timezone as string || "UTC"})
          </div>
        </div>
      )}

      {/* Outgoing webhook details */}
      {trigger.kind === "outgoing_webhook" && (
        <div className="space-y-3 mb-4">
          <div className="text-xs text-[var(--muted-foreground)]">
            Callback: <span className="font-medium text-[var(--foreground)]">{trigger.callback_url || "not set"}</span>
          </div>
        </div>
      )}

      {/* Editable settings */}
      <div className="border-t border-[var(--border)] pt-4 mt-4">
        <h4 className="text-sm font-medium mb-3">Settings</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {entryNodes.length > 0 && (
            <Field label="Entry node">
              <select className={fieldCls} value={entryNodeId} onChange={(e) => setEntryNodeId(e.target.value)}>
                <option value="">Default (whole flow)</option>
                {entryNodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
              </select>
            </Field>
          )}
          {trigger.kind === "outgoing_webhook" && (
            <Field label="Callback URL">
              <input className={fieldCls} value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://..." />
            </Field>
          )}
          {trigger.kind === "schedule" && (
            <>
              <Field label="Cron expression">
                <input className={fieldCls} value={cron} onChange={(e) => setCron(e.target.value)} />
              </Field>
              <Field label="Timezone">
                <select className={fieldCls} value={tz} onChange={(e) => setTz(e.target.value)}>
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
            </>
          )}
          {(trigger.kind === "public_form" || trigger.kind === "outgoing_webhook") && (
            <Field label="Show outputs">
              <label className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={showOutputs} onChange={(e) => setShowOutputs(e.target.checked)} />
                <span className="text-sm">Display results to the user</span>
              </label>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Trigger Row ---------- */

function TriggerRow({
  trigger,
  flow,
  onToggle,
  onEdit,
  onDelete,
}: {
  trigger: TriggerWithWebhook;
  flow?: Flow;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const ws = trigger.webhook_secrets?.[0];
  const webhookUrl = ws ? `${apiBase}/t/webhook/${ws.token}` : null;
  const formUrl = ws ? `/p/${ws.token}` : null;

  const kindMeta = TRIGGER_KINDS.find((k) => k.kind === trigger.kind) || {
    label: trigger.kind.replace("_", " "),
    icon: <Globe size={18} />,
  };

  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-[var(--muted-foreground)]">{kindMeta.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate flex items-center gap-2">
            {flow?.name || trigger.flow_id.slice(0, 8)}
            <span className="pill bg-[var(--secondary)] text-[var(--primary)]">{kindMeta.label}</span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
            {trigger.kind === "schedule" && `cron: ${(trigger.config?.cron as string) || ""}`}
            {(trigger.kind === "webhook" || trigger.kind === "incoming_webhook") && (webhookUrl || "webhook")}
            {trigger.kind === "outgoing_webhook" && `→ ${trigger.callback_url || "no URL"}`}
            {trigger.kind === "public_form" && (formUrl ? `Form: ${formUrl}` : "public form")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onToggle}
          className={`pill cursor-pointer hover:brightness-95 transition-[filter] ${
            trigger.is_active
              ? "bg-[var(--secondary)] text-[var(--primary)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
          }`}
          aria-pressed={trigger.is_active}
        >
          {trigger.is_active ? "Active" : "Paused"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--secondary)] transition-colors px-2 py-1 rounded-md flex items-center gap-1 text-xs"
        >
          <Pencil size={14} /> Edit
        </button>
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

/* ---------- Helpers ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm mt-1 first:mt-0">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      {children}
    </label>
  );
}
