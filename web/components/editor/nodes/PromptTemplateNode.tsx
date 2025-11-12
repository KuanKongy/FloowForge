"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2, PencilLine, Boxes } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { CustomNode } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";

export default function PromptTemplateNode({ id, data, isConnectable }: NodeProps) {
  const rf = useReactFlow();
  const { custom_node_id, isFrontend = true } = data as { custom_node_id?: string; isFrontend?: boolean };
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  const ctrl = useNodeFrameControls(id, {
    defaultName: "Double Click to Edit",
    data: data as Record<string, unknown>,
    collapsible: true,
  });

  const displayName = ctrl.name || "Double Click to Edit";
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  function commitName() {
    setEditingName(false);
    const next = draftName.trim();
    if (next) rf.updateNodeData(id, { name: next });
  }

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
      hidden={isFrontend}
      defaultName="Custom Node"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[24em]"
      headerVariant="none"
    >
      <div className="p-3 flex flex-col gap-3">
        <div className="relative flex items-center gap-x-[0.9em]">
          <div
            className="rounded-[10px] p-[0.25em]"
            style={{ background: "rgba(var(--text__background-rgb), 1)" }}
          >
            <div
              className="rounded-[8px] h-[3em] w-[3em] bg-white flex items-center justify-center"
              style={{
                boxShadow: "0 1px 2px 0 rgba(var(--text__font-rgb), 0.5)",
                color: "rgba(var(--text__font-rgb), 1)",
              }}
            >
              <Boxes size={24} />
            </div>
          </div>
          <div className="flex flex-col justify-center gap-y-[0.15em]">
            <div className="flex">
              <div
                className="rounded-[10em] font-medium text-[0.7rem] flex items-center justify-center px-[0.7em] py-[0.04em]"
                style={{
                  backgroundColor: "rgba(var(--text__background-rgb), 1)",
                  color: "rgba(var(--text__font-rgb), 1)",
                }}
              >
                Custom Node
              </div>
            </div>
            <div className="flex flex-row items-center gap-x-2">
              <div className="font-semibold text-[1rem]">
                {editingName ? (
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    autoFocus
                    className="nodrag nopan w-full focus:outline-none border-none bg-transparent"
                  />
                ) : (
                  <div
                    onDoubleClick={() => setEditingName(true)}
                    className="cursor-pointer"
                    title="Double-click to rename"
                  >
                    {displayName}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-[var(--font--light)] hover:text-[var(--primary)] transition-colors"
                aria-label="Rename"
              >
                <PencilLine size={16} />
              </button>
              {ctrl.renderWaitChip("inline")}
            </div>
          </div>
          <button
            type="button"
            className="absolute top-0 right-0 p-2 cursor-pointer rounded-md hover:bg-[var(--hover-bg)] transition-colors"
            onClick={ctrl.toggleCollapsed}
            aria-label={ctrl.collapsed ? "Expand" : "Collapse"}
          >
            {ctrl.collapsed ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
          </button>
        </div>

        {!ctrl.collapsed && (
          <>
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
          </>
        )}
      </div>
    </NodeFrame>
  );
}
