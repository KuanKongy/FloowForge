"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  Plus,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import type { Flow } from "@flowforge/shared";

type Run = {
  id: string;
  flow_id: string;
  status: string;
  trigger_kind: string;
  created_at: string;
};

type Trigger = {
  id: string;
  flow_id: string;
  kind: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
};

export default function DashboardPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      apiGet<Flow[]>("/flows").catch(() => [] as Flow[]),
      apiGet<Run[]>("/runs?limit=10").catch(() => [] as Run[]),
      apiGet<Trigger[]>("/triggers").catch(() => [] as Trigger[]),
    ])
      .then(([f, r, t]) => {
        setFlows(f);
        setRuns(r);
        setTriggers(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const flowMap = Object.fromEntries(flows.map((f) => [f.id, f]));

  async function createFlow() {
    setCreateError(null);
    setCreating(true);
    try {
      const flow = await apiPost<Flow>("/flows", { name: "Untitled flow" });
      router.push(`/app/flows/${flow.id}`);
    } catch (e: unknown) {
      setCreateError(
        e instanceof Error ? e.message : "Could not create flow. Is the API running?"
      );
    } finally {
      setCreating(false);
    }
  }

  function relTime(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function runIcon(status: string) {
    switch (status) {
      case "succeeded":
        return <CheckCircle2 size={14} className="text-green-500" />;
      case "failed":
        return <XCircle size={14} className="text-red-500" />;
      case "running":
        return <Play size={14} className="text-blue-500" />;
      default:
        return <Activity size={14} className="text-[var(--muted-foreground)]" />;
    }
  }

  const scheduledTriggers = triggers
    .filter((t) => t.kind === "schedule" && t.is_active)
    .map((t) => ({ trigger: t, nextAt: nextScheduleTime(t) }))
    .sort((a, b) => (a.nextAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.nextAt?.getTime() ?? Number.MAX_SAFE_INTEGER));

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Here&apos;s what&apos;s happening with your workflows.
          </p>
        </div>
        <div className="relative flex">
          <Button
            onClick={createFlow}
            disabled={creating}
            className="rounded-r-none border-r border-r-white/20"
          >
            {creating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {creating ? "Creating…" : "Create Workflow"}
          </Button>
          <Button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="rounded-l-none px-2"
            aria-label="More create options"
          >
            <ChevronDown size={14} />
          </Button>
          {showCreateDropdown && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-[10px] shadow-lg border border-[var(--border)] py-1 z-50">
              <button
                onClick={() => {
                  setShowCreateDropdown(false);
                  router.push("/app/triggers");
                }}
                className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--muted)] flex items-center gap-2 transition-colors"
              >
                <Zap size={14} /> Create Trigger
              </button>
            </div>
          )}
        </div>
      </div>

      {createError && (
        <div className="text-sm text-red-500 mb-4" role="alert">{createError}</div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card-surface p-5">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
            <Activity size={16} /> Recent Activity
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No recent runs. Create a workflow and run it to see activity here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.slice(0, 8).map((run) => (
                <Link
                  key={run.id}
                  href={`/app/runs/${run.id}`}
                  className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--muted)] transition-colors text-sm"
                >
                  {runIcon(run.status)}
                  <span className="flex-1 truncate">
                    {flowMap[run.flow_id]?.name || "Unknown flow"}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)] shrink-0">
                    {relTime(run.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Triggers */}
        <div className="card-surface p-5">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
            <Calendar size={16} /> Upcoming Triggers
          </h2>
          {scheduledTriggers.length === 0 ? (
            <div className="text-sm text-[var(--muted-foreground)]">
              <p>No scheduled triggers yet.</p>
              <Link
                href="/app/triggers"
                className="text-[var(--primary)] hover:underline mt-1 inline-block"
              >
                Add one to automate your workflows →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {scheduledTriggers.slice(0, 6).map(({ trigger: t, nextAt }) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg text-sm"
                >
                  <Zap size={14} className="text-amber-500 shrink-0" />
                  <span className="flex-1 truncate">
                    {flowMap[t.flow_id]?.name || "Unknown flow"}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)] shrink-0 text-right">
                    {nextAt ? timeUntil(nextAt) : ((t.config?.cron as string) || "—")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function nextScheduleTime(trigger: Trigger): Date | null {
  const config = trigger.config || {};
  const mode = (config.schedule_mode as string) || "cron";
  const now = new Date();
  if (mode === "once") {
    const onceAt = config.once_at as string | undefined;
    if (!onceAt) return null;
    const date = new Date(onceAt);
    return date.getTime() > now.getTime() ? date : null;
  }
  if (mode === "delay") {
    const base = new Date(trigger.created_at);
    const seconds =
      (Number(config.delay_hours) || 0) * 3600 +
      (Number(config.delay_minutes) || 0) * 60 +
      (Number(config.delay_seconds) || 0);
    const date = new Date(base.getTime() + Math.max(seconds, 3600) * 1000);
    return date.getTime() > now.getTime() ? date : null;
  }
  if (mode === "interval") {
    const seconds =
      (Number(config.interval_hours) || 0) * 3600 +
      (Number(config.interval_minutes) || 0) * 60 +
      (Number(config.interval_seconds) || 0);
    if (seconds <= 0) return null;
    const base = new Date(trigger.created_at).getTime();
    const elapsed = Math.max(0, now.getTime() - base);
    const periods = Math.floor(elapsed / (seconds * 1000)) + 1;
    return new Date(base + periods * seconds * 1000);
  }
  const cron = config.cron as string | undefined;
  return cron ? nextCronTime(cron, now) : null;
}

function nextCronTime(cron: string, from: Date): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;
  const start = new Date(from.getTime() + 60_000);
  start.setSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i += 1) {
    const d = new Date(start.getTime() + i * 60_000);
    if (
      cronMatches(d.getMinutes(), minExpr, 0, 59) &&
      cronMatches(d.getHours(), hourExpr, 0, 23) &&
      cronMatches(d.getDate(), dayExpr, 1, 31) &&
      cronMatches(d.getMonth() + 1, monthExpr, 1, 12) &&
      cronMatches(d.getDay(), weekdayExpr, 0, 6)
    ) {
      return d;
    }
  }
  return null;
}

function cronMatches(value: number, expr: string, min: number, max: number): boolean {
  if (expr === "*") return true;
  return expr.split(",").some((part) => {
    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      return step > 0 && value % step === 0;
    }
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      return value >= Math.max(min, a) && value <= Math.min(max, b);
    }
    return Number(part) === value;
  });
}

function timeUntil(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "due now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "in <1m";
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins ? `in ${hrs}h ${remMins}m` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHours = hrs % 24;
  return remHours ? `in ${days}d ${remHours}h` : `in ${days}d`;
}
