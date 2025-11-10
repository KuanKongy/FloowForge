"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { CustomNode } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";


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

export default function PromptTemplateNode({ id, data, isConnectable }: NodeProps) {
  const rf = useReactFlow();
  const { custom_node_id } = data as { custom_node_id?: string };
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  useEffect(() => {
    apiGet<CustomNode[]>("/custom-nodes?kind=prompt_template")
      .then(setNodes)
      .catch(() => setNodes([]));
  }, []);

  const selected = nodes.find((n) => n.id === custom_node_id);

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={false}
      defaultName="Custom Node"
      data={data as Record<string, unknown>}
      showWaitChip
      collapsible
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[24em]"
    >
      <div className="p-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-[10px] p-2"
            style={{
              backgroundColor: "rgba(var(--text__background-rgb), 1)",
              color: "rgba(var(--text__font-rgb), 1)",
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div className="pill bg-[var(--secondary)] text-[var(--primary)] inline-block">Custom Node</div>
            <div className="font-semibold mt-0.5">{selected?.name || "Select a custom node"}</div>
          </div>
        </div>
        <select
          value={custom_node_id || ""}
          onChange={(e) => rf.updateNodeData(id, { custom_node_id: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-9 px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm nodrag nopan"
        >
          <option value="">Select…</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        {selected && (
          <div className="text-xs text-[var(--muted-foreground)]">
            Inputs: {selected.schema.inputs.map((i) => i.name).join(", ") || "—"}
            <br />
            Outputs: {selected.schema.outputs.map((o) => o.name).join(", ") || "—"}
          </div>
        )}
      </div>
    </NodeFrame>
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

