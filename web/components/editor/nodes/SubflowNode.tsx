"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { Flow } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";

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
