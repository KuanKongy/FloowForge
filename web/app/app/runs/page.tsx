"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, Clock3, Search, SlidersHorizontal } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Flow, Run } from "@flowforge/shared";

type SortKey = "newest" | "oldest" | "duration_desc" | "duration_asc" | "flow";
type TimeWindow = "all" | "1h" | "3h" | "12h" | "1d" | "3d" | "7d";

const STATUS_TONE: Record<Run["status"], { bg: string; fg: string; dot: string }> = {
  queued: { bg: "var(--muted)", fg: "var(--muted-foreground)", dot: "#9ca3af" },
  running: { bg: "rgba(var(--audio__background-rgb), 1)", fg: "rgba(var(--audio__font-rgb), 1)", dot: "var(--audio__font)" },
  succeeded: { bg: "rgba(var(--image__background-rgb), 1)", fg: "rgba(var(--image__font-rgb), 1)", dot: "var(--image__font)" },
  failed: { bg: "#fee2e2", fg: "#b91c1c", dot: "#ef4444" },
  cancelled: { bg: "var(--primary-grey)", fg: "var(--muted-foreground)", dot: "#6b7280" },
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [flowId, setFlowId] = useState("all");
  const [status, setStatus] = useState<Run["status"] | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");

  useEffect(() => {
    Promise.all([
      apiGet<Run[]>("/runs").catch(() => []),
      apiGet<Flow[]>("/flows").catch(() => []),
    ])
      .then(([runRows, flowRows]) => {
        setRuns(runRows);
        setFlows(flowRows);
      })
      .finally(() => setLoading(false));
  }, []);

  const flowById = useMemo(() => {
    const map: Record<string, Flow> = {};
    flows.forEach((f) => (map[f.id] = f));
    return map;
  }, [flows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = runs.filter((run) => {
      const flow = flowById[run.flow_id];
      const haystack = `${run.id} ${run.trigger_kind} ${run.status} ${flow?.name || run.flow_id}`.toLowerCase();
      return (
        (flowId === "all" || run.flow_id === flowId) &&
        (status === "all" || run.status === status) &&
        inTimeWindow(run, timeWindow) &&
        (!q || haystack.includes(q))
      );
    });
    rows.sort((a, b) => {
      if (sort === "flow") return flowName(a, flowById).localeCompare(flowName(b, flowById));
      if (sort === "duration_desc") return durationMs(b) - durationMs(a);
      if (sort === "duration_asc") return durationMs(a) - durationMs(b);
      const at = dateMs(a);
      const bt = dateMs(b);
      return sort === "oldest" ? at - bt : bt - at;
    });
    return rows;
  }, [runs, flowById, flowId, status, query, sort, timeWindow]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Runs</h1>
          <p className="text-sm text-[var(--muted-foreground)] max-w-2xl">
            Find a workflow run by flow, status, trigger, time, or duration. Failed runs stay easy
            to spot so you can jump into the timeline and fix the exact node.
          </p>
        </div>
      </div>

      <div className="card-surface p-4 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <SlidersHorizontal size={16} /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <label className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search run, flow, trigger..."
              className="h-9 w-full pl-9 pr-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm"
            />
          </label>
          <select className={selectCls} value={flowId} onChange={(e) => setFlowId(e.target.value)}>
            <option value="all">All workflows</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>{flow.name}</option>
            ))}
          </select>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as Run["status"] | "all")}>
            <option value="all">All statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className={selectCls} value={timeWindow} onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}>
            <option value="all">All time</option>
            <option value="1h">Past hour</option>
            <option value="3h">Past 3 hours</option>
            <option value="12h">Past 12 hours</option>
            <option value="1d">Past day</option>
            <option value="3d">Past 3 days</option>
            <option value="7d">Past week</option>
          </select>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="duration_desc">Longest duration</option>
            <option value="duration_asc">Shortest duration</option>
            <option value="flow">Workflow name</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-10 text-center text-[var(--muted-foreground)]">
          No runs match these filters.
        </div>
      ) : (
        <div className="card-surface divide-y divide-[var(--border)] overflow-hidden">
          {filtered.map((run) => {
            const tone = STATUS_TONE[run.status];
            const flow = flowById[run.flow_id];
            return (
              <Link
                key={run.id}
                href={`/app/runs/${run.id}`}
                className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 hover:bg-[var(--muted)] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="size-2 rounded-full mt-2 shrink-0" style={{ background: tone.dot }} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{flow?.name || `Flow ${run.flow_id.slice(0, 8)}`}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      Run {run.id.slice(0, 8)} · {run.trigger_kind} · {run.error ? trim(run.error, 90) : "No top error"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <span className="pill" style={{ background: tone.bg, color: tone.fg }}>{run.status}</span>
                  <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
                    <Clock3 size={13} /> {formatDuration(run)}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1 min-w-[150px] justify-end">
                    <ArrowDownAZ size={13} /> {formatDate(run)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const selectCls = "h-9 w-full px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm";

function dateMs(run: Run): number {
  return new Date(run.started_at || (run as Run & { created_at?: string }).created_at || 0).getTime();
}

function inTimeWindow(run: Run, window: TimeWindow): boolean {
  if (window === "all") return true;
  const hours: Record<Exclude<TimeWindow, "all">, number> = {
    "1h": 1,
    "3h": 3,
    "12h": 12,
    "1d": 24,
    "3d": 72,
    "7d": 168,
  };
  return Date.now() - dateMs(run) <= hours[window] * 60 * 60 * 1000;
}

function durationMs(run: Run): number {
  if (!run.started_at || !run.ended_at) return run.status === "running" ? Date.now() - new Date(run.started_at || Date.now()).getTime() : 0;
  return Math.max(0, new Date(run.ended_at).getTime() - new Date(run.started_at).getTime());
}

function flowName(run: Run, flowById: Record<string, Flow>): string {
  return flowById[run.flow_id]?.name || run.flow_id;
}

function formatDuration(run: Run): string {
  const ms = durationMs(run);
  if (!ms) return run.status === "queued" ? "queued" : "-";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatDate(run: Run): string {
  const value = run.started_at || (run as Run & { created_at?: string }).created_at;
  return value ? new Date(value).toLocaleString() : "Not started";
}

function trim(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
