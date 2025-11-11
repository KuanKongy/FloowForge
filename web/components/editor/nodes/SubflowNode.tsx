"use client";

import { useEffect, useState } from "react";
import { Boxes, Maximize2, Minimize2 } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { apiGet } from "@/lib/api";
import type { Flow } from "@flowforge/shared";
import { useTopoStep, useInScope } from "../order-context";

export default function SubflowNode({ id, data, isConnectable }: NodeProps) {
  const rf = useReactFlow();
  const { flow_id, value: fixedDefault = "" } = data as { flow_id?: string; value?: string };
  const [subflows, setSubflows] = useState<Flow[]>([]);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  const ctrl = useNodeFrameControls(id, {
    defaultName: "Subflow",
    data: data as Record<string, unknown>,
    collapsible: true,
  });

  useEffect(() => {
    apiGet<Flow[]>("/flows").then(setSubflows).catch(() => setSubflows([]));
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
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[22em]"
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
                Subflow
              </div>
            </div>
            <div className="flex flex-row items-center gap-x-2">
              {ctrl.renderRename({
                wrapperClassName: "flex items-center gap-x-2 group",
                staticClassName: "font-semibold text-[1rem] cursor-pointer select-none",
                inputClassName: "nodrag nopan font-semibold text-[1rem] bg-transparent border-b border-[var(--primary)] outline-none w-full",
                showPencil: true,
              })}
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
          </>
        )}
      </div>
    </NodeFrame>
  );
}
