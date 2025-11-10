"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { CustomNode } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";

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
