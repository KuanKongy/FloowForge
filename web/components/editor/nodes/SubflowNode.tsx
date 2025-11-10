"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { Flow } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";


function moveEditorPaletteItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeEditorPaletteItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}


function groupEditorQueueByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countEditorQueueByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export default function SubflowNode({ id, data, isConnectable }: NodeProps) {
  const rf = useReactFlow();
  const { flow_id, value: fixedDefault = "" } = data as { flow_id?: string; value?: string };
  const [subflows, setSubflows] = useState<Flow[]>([]);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  useEffect(() => {
    apiGet<Flow[]>("/flows?is_subflow=true").then(setSubflows).catch(() => setSubflows([]));
  }, []);

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={false}
      defaultName="Subflow"
      data={data as Record<string, unknown>}
      showWaitChip
      collapsible
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[22em]"
    >
      <div className="p-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-[10px] p-2"
            style={{ backgroundColor: "var(--secondary)", color: "var(--primary)" }}
          >
            <Boxes size={20} />
          </div>
          <div>
            <div className="pill bg-[var(--secondary)] text-[var(--primary)] inline-block">Subflow</div>
            <div className="font-semibold mt-0.5">Reuse a saved flow</div>
          </div>
        </div>
        <select
          value={flow_id || ""}
          onChange={(e) => rf.updateNodeData(id, { flow_id: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm nodrag nopan"
        >
          <option value="">Select subflow…</option>
          {subflows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {/* Fixed default input — used when no upstream node is wired into
            this subflow (mirrors how Webhook / Button entries behave). */}
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted-foreground)] font-medium">
            Default input (used if nothing wired)
          </span>
          <textarea
            value={fixedDefault}
            onChange={(e) => rf.updateNodeData(id, { value: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Static value to pass when no upstream is connected."
            className="px-2 py-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] resize-none nodrag nopan h-[3.5em]"
          />
        </label>
      </div>
    </NodeFrame>
  );
}

function buildEditorProviderSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorProviderRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorProviderSearchText(record).includes(needle));
}


function pickEditorSessionChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeEditorSessionPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

