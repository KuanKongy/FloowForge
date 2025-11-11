"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleSlash, Loader2, X } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { NodeRunState } from "./run-state-context";

export type RunEvent = {
  kind: string;
  node_id: string | null;
  payload: Record<string, unknown>;
  duration_ms?: number | null;
  ts?: string;
};

/**
 * Right-edge floating panel showing per-node status, durations, and total
 * elapsed time. Uses the same broadcast subscription as the canvas highlights;
 * it just renders the data differently (Gumloop-style "steps and timing").
 *
 * Each row shows a quick "View IO" button on hover that opens a modal with
 * separate Inputs and Output tabs - useful for debugging a flow without
 * having to rerun it. The data comes from ``node_started.payload.inputs``
 * and ``node_succeeded.payload.output`` which the executor records.
 */
export function RunSidebar({
  nodes,
  states,
  events,
  totalDurationMs,
  onClose,
  offsetRight = 0,
}: {
  nodes: Node[];
  states: Record<string, NodeRunState>;
  events: RunEvent[];
  totalDurationMs: number | null;
  onClose: () => void;
  /** Pixel offset from the right edge of the canvas; used to make room for
   * the run history panel when both are open. */
  offsetRight?: number;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ioFor, setIoFor] = useState<string | null>(null);

  const nodeMeta = useMemo(() => {
    const map: Record<string, { name: string; type: string }> = {};
    nodes.forEach((n) => {
      const data = (n.data || {}) as Record<string, unknown>;
      map[n.id] = {
        name:
          (typeof data.name === "string" && data.name) ||
          (typeof data.label === "string" && (data.label as string)) ||
          (typeof data.text === "string" && (data.text as string)) ||
          (n.type ?? "node"),
        type: n.type || "unknown",
      };
    });
    return map;
  }, [nodes]);

  const rows = useMemo(() => {
    // Pull both the last `node_started` (for inputs) and the last
    // `node_succeeded` / `node_failed` (for output / error / status) per
    // node, then merge.
    const lastStart: Record<string, RunEvent> = {};
    const lastEnd: Record<string, RunEvent> = {};
    events.forEach((e) => {
      if (!e.node_id) return;
      if (e.kind === "node_started") lastStart[e.node_id] = e;
      else if (e.kind === "node_succeeded" || e.kind === "node_failed" || e.kind === "node_skipped") {
        lastEnd[e.node_id] = e;
      }
    });
    const ids = new Set([...Object.keys(lastStart), ...Object.keys(lastEnd)]);
    return Array.from(ids)
      .filter((id) => nodeMeta[id])
      .map((id) => {
        const status = states[id] || "idle";
        const start = lastStart[id];
        const end = lastEnd[id];
        const duration =
          end?.duration_ms ??
          (end?.payload?.duration_ms as number | undefined) ??
          start?.duration_ms ??
          null;
        return {
          id,
          name: nodeMeta[id].name,
          type: nodeMeta[id].type,
          status,
          duration,
          inputs: (start?.payload?.inputs as unknown[] | undefined) || [],
          output: end?.payload?.output ?? end?.payload?.summary ?? null,
          error: end?.kind === "node_failed" ? (end.payload?.error as string) : undefined,
        };
      });
  }, [events, states, nodeMeta]);

  const ioRow = ioFor ? rows.find((r) => r.id === ioFor) : null;
  const runFailureValue = [...events]
    .reverse()
    .find((e) => e.kind === "run_failed" && !e.node_id)?.payload?.error;
  const runFailure = typeof runFailureValue === "string" ? runFailureValue : null;

  return (
    <>
      <aside
        className="run-sidebar pointer-events-auto"
        aria-label="Run sidebar"
        style={{ right: 16 + offsetRight }}
      >
        <header className="run-sidebar__header">
          <span className="font-semibold text-sm">Run details</span>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors p-1 rounded-md hover:bg-[var(--muted)]"
          >
            <X size={16} />
          </button>
        </header>
        {rows.length === 0 && runFailure && (
          <div className="m-4 rounded-[8px] bg-[rgba(239,68,68,0.08)] p-3 text-xs text-[#b91c1c]">
            <div className="font-semibold mb-1">Run failed before node execution</div>
            <div className="whitespace-pre-wrap break-words">{String(runFailure)}</div>
          </div>
        )}
        {rows.length === 0 && !runFailure && (
          <div className="px-4 py-6 text-xs text-[var(--muted-foreground)]">Waiting for events...</div>
        )}
        {rows.map((row) => {
          const isOpen = expanded[row.id];
          return (
            <div key={row.id}>
              <div
                className="run-sidebar__row group"
                onClick={() => setExpanded((e) => ({ ...e, [row.id]: !e[row.id] }))}
              >
                <span className={`run-sidebar__chip run-sidebar__chip--${row.status}`}>
                  <StatusIcon status={row.status} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{row.name}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">{row.type}</div>
                </div>
                {row.duration != null && (
                  <span className="run-sidebar__time">{formatMs(row.duration)}</span>
                )}
                <button
                  type="button"
                  className="run-sidebar__io-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIoFor(row.id);
                  }}
                >
                  IO
                </button>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {isOpen && (
                <div className="px-5 pb-3 -mt-1 text-[11px] text-[var(--muted-foreground)]">
                  {row.error ? (
                    <pre className="bg-[rgba(239,68,68,0.08)] text-[#b91c1c] p-2 rounded-[6px] whitespace-pre-wrap break-words">
                      {row.error}
                    </pre>
                  ) : (
                    <pre className="bg-[var(--muted)] p-2 rounded-[6px] whitespace-pre-wrap break-words">
                      {prettyValue(row.output)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {rows.length > 0 && (
          <footer className="px-4 py-3 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] flex items-center justify-between">
            <span>{rows.length} nodes</span>
            {totalDurationMs != null && <span>Total {formatMs(totalDurationMs)}</span>}
          </footer>
        )}
      </aside>
      {ioRow && (
        <NodeIoModal
          row={ioRow}
          onClose={() => setIoFor(null)}
        />
      )}
    </>
  );
}

function NodeIoModal({
  row,
  onClose,
}: {
  row: {
    id: string;
    name: string;
    type: string;
    status: NodeRunState;
    inputs: unknown[];
    output: unknown;
    error?: string;
  };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"inputs" | "output">("output");

  // Esc closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${row.name} inputs and output`}
    >
      <div
        className="card-surface w-[min(720px,100%)] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              {row.type}
            </span>
            <span className="font-semibold text-base truncate">{row.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-full bg-[var(--muted)] p-1 text-xs">
            <button
              onClick={() => setTab("inputs")}
              className={`px-3 py-1 rounded-full transition-colors ${
                tab === "inputs" ? "bg-white shadow-sm" : "text-[var(--muted-foreground)]"
              }`}
            >
              Inputs ({row.inputs.length})
            </button>
            <button
              onClick={() => setTab("output")}
              className={`px-3 py-1 rounded-full transition-colors ${
                tab === "output" ? "bg-white shadow-sm" : "text-[var(--muted-foreground)]"
              }`}
            >
              Output
            </button>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-md hover:bg-[var(--muted)] transition-colors"
          >
            <X size={16} />
          </button>
        </header>
        <div className="overflow-auto p-5 flex-1">
          {tab === "inputs" ? (
            row.inputs.length === 0 ? (
              <Empty>No inputs were resolved for this node.</Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {row.inputs.map((v, i) => (
                  <ValueBlock key={i} label={`Input #${i + 1}`} value={v} />
                ))}
              </div>
            )
          ) : row.error ? (
            <pre className="bg-[rgba(239,68,68,0.08)] text-[#b91c1c] p-3 rounded-[8px] whitespace-pre-wrap break-words text-sm">
              {row.error}
            </pre>
          ) : (
            <ValueBlock label="Output" value={row.output} />
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-[var(--muted-foreground)]">{children}</div>;
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const isImage =
    typeof value === "string" &&
    (value.startsWith("data:image/") || /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(value));
  const isUrl =
    typeof value === "string" && /^https?:\/\//i.test(value) && !isImage;

  // The "raw" view of huge data URLs can be megabytes of base64 even after
  // truncation; cap the displayed string at ~4 KB and add a clear "+N more"
  // marker so the modal stays usable.
  const RAW_DISPLAY_CAP = 4000;
  const rawText = prettyValue(value);
  const tooLong = rawText.length > RAW_DISPLAY_CAP;
  const displayedRaw = tooLong
    ? `${rawText.slice(0, Math.floor(RAW_DISPLAY_CAP * 0.7))}…(+${
        rawText.length - RAW_DISPLAY_CAP
      } more chars)…${rawText.slice(-Math.floor(RAW_DISPLAY_CAP * 0.2))}`
    : rawText;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</span>
        {(isImage || isUrl || typeof value === "object" || tooLong) && (
          <button
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {showRaw ? "Show preview" : "Show raw"}
          </button>
        )}
      </div>
      {!showRaw && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value as string}
          alt="Output preview"
          className="max-h-[360px] rounded-[10px] border border-[var(--border)] object-contain bg-[var(--muted)]"
        />
      ) : !showRaw && isUrl ? (
        <a
          href={value as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--primary)] hover:underline break-all"
        >
          {value as string}
        </a>
      ) : (
        <pre className="bg-[var(--muted)] p-3 rounded-[8px] whitespace-pre-wrap break-words text-sm max-h-[420px] overflow-auto">
          {displayedRaw}
        </pre>
      )}
    </div>
  );
}

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusIcon({ status }: { status: NodeRunState }) {
  if (status === "running") return <Loader2 size={12} className="animate-spin" />;
  if (status === "succeeded") return <Check size={12} />;
  if (status === "failed") return <X size={12} />;
  if (status === "skipped") return <CircleSlash size={12} />;
  return <span className="size-2 rounded-full bg-current opacity-50" aria-hidden />;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
