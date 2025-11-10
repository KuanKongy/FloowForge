"use client";

import { useEffect, useState } from "react";
import { Webhook, MousePointerClick, Copy, Check, Plus, Loader2 } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";
import { apiGet, apiPost } from "@/lib/api";
import type { Trigger } from "@flowforge/shared";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

type TriggerWithWebhook = Trigger & {
  webhook_secrets?: Array<{ token: string }>;
};

/**
 * Webhook In / Manual In entry-point nodes. Triggers fire externally:
 *
 * - **Webhook In:** POST to ``/t/webhook/:token`` with a JSON body. The body
 *   becomes ``ctx.input`` for the run, and ``start_node_ids`` is set to this
 *   node so the engine begins here. The token is created on the Triggers
 *   page; the URL is mirrored here for convenience and copy.
 * - **Manual In:** the flow can be started by hitting ``POST /flows/:id/runs``
 *   with ``start_node_ids=[node.id]``. We surface that path so power users
 *   can wire it from CLI / curl / forms.
 *
 * If no upstream input is wired, downstream nodes fall back to whatever
 * fixed values they hold (same semantics as the Subflow node).
 */
export default function TriggerNode({ id, type, data, isConnectable }: NodeProps) {
  const isWebhook = type === "webhook_in";
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const Icon = isWebhook ? Webhook : MousePointerClick;
  const { flow_id } = data as { flow_id?: string };

  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Look up an existing webhook trigger for this flow so we can show the
  // public URL inline. The user can configure additional triggers on the
  // Triggers page.
  useEffect(() => {
    if (!isWebhook || !flow_id) return;
    apiGet<TriggerWithWebhook[]>(`/triggers?flow_id=${encodeURIComponent(flow_id)}`)
      .then((triggers) => {
        const wh = triggers.find((t) => t.kind === "webhook" && t.webhook_secrets?.[0]?.token);
        if (wh) setWebhookUrl(`${API}/t/webhook/${wh.webhook_secrets![0].token}`);
      })
      .catch(() => {});
  }, [isWebhook, flow_id]);

  function copy() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function createWebhook() {
    if (!flow_id) return;
    setCreating(true);
    setCreateError(null);
    try {
      const trigger = await apiPost<TriggerWithWebhook>("/triggers", {
        flow_id,
        kind: "webhook",
        config: {},
      });
      const token = trigger.webhook_secrets?.[0]?.token;
      if (token) setWebhookUrl(`${API}/t/webhook/${token}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={false}
      defaultName={isWebhook ? "Webhook In" : "Manual In"}
      data={data as Record<string, unknown>}
      headerVariant="none"
      topoStep={step}
      className={`${inScope ? "scope-active" : "scope-dimmed"} ${
        isWebhook && webhookUrl ? "trigger-configured" : ""
      }`}
      cardClassName="w-[26em]"
    >
      <div className="p-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-[10px] p-2"
            style={{ backgroundColor: "var(--secondary)", color: "var(--primary)" }}
          >
            <Icon size={20} />
          </div>
          <div>
            <div className="pill bg-[var(--secondary)] text-[var(--primary)] inline-block">
              {isWebhook ? "Webhook" : "Manual"}
            </div>
            <div className="font-semibold mt-0.5">
              {isWebhook ? "External trigger entry" : "Manual run entry"}
            </div>
          </div>
        </div>
        {isWebhook ? (
          webhookUrl ? (
            <div className="flex flex-col gap-2 text-xs">
              <span className="text-[var(--muted-foreground)] font-medium">POST URL (machine)</span>
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] nodrag nopan"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <code className="flex-1 truncate text-[11px]">{webhookUrl}</code>
                <button
                  onClick={copy}
                  type="button"
                  aria-label="Copy webhook URL"
                  className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {(() => {
                // Derive the public form URL from the webhook URL so users
                // can share a friendly link with non-technical people.
                const token = webhookUrl.split("/").pop();
                if (!token || typeof window === "undefined") return null;
                const formUrl = `${window.location.origin}/p/${token}`;
                return (
                  <>
                    <span className="text-[var(--muted-foreground)] font-medium">
                      Public form (humans)
                    </span>
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] nodrag nopan"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <a
                        href={formUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-[11px] text-[var(--primary)] hover:underline"
                      >
                        {formUrl}
                      </a>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(formUrl)}
                        className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                        aria-label="Copy form URL"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 nodrag nopan" onMouseDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={createWebhook}
                disabled={creating || !flow_id}
                className="text-xs h-8 rounded-full px-3 bg-[var(--secondary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors flex items-center gap-1.5 self-start"
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {creating ? "Creating…" : "Generate webhook URL"}
              </button>
              {createError && <span className="text-[11px] text-red-500">{createError}</span>}
            </div>
          )
        ) : (
          <div className="text-[11px] text-[var(--muted-foreground)] leading-snug">
            POST{" "}
            <code className="px-1 rounded bg-[var(--muted)] text-[10px]">
              {API}/flows/{flow_id || "<flow_id>"}/runs
            </code>{" "}
            with body{" "}
            <code className="px-1 rounded bg-[var(--muted)] text-[10px]">
              {`{ "start_node_ids": ["${id}"] }`}
            </code>
            .
          </div>
        )}
      </div>
    </NodeFrame>
  );
}
