"use client";

import { Webhook, FileText, CalendarClock, PencilLine } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import { useState, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";

/**
 * Visual entry-point markers for Webhook In / Public In / Schedule In.
 * All trigger management (creating webhooks, schedules, forms) happens on the
 * Triggers page -- these canvas nodes just mark where a branch begins.
 * Supports inline rename so users can differentiate between entry points.
 */
export default function TriggerNode({ id, type, data, isConnectable }: NodeProps) {
  const { isFrontend = true } = data as { isFrontend?: boolean };
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const rf = useReactFlow();

  let Icon = FileText;
  let defaultLabel = "Public In";
  let pill = "Public";
  if (type === "webhook_in") {
    Icon = Webhook;
    defaultLabel = "Webhook In";
    pill = "Webhook";
  } else if (type === "schedule_in") {
    Icon = CalendarClock;
    defaultLabel = "Schedule In";
    pill = "Schedule";
  }

  const storedName = ((data as Record<string, unknown>).name as string) || "";
  const displayName = storedName || defaultLabel;

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  function commitName() {
    const next = draftName.trim();
    setEditingName(false);
    if (next && next !== displayName) {
      rf.updateNodeData(id, { name: next });
    } else {
      setDraftName(displayName);
    }
  }

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={isFrontend}
      defaultName={defaultLabel}
      data={data as Record<string, unknown>}
      headerVariant="none"
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[18em]"
    >
      <div className="p-2 flex items-center gap-3">
        <div
            className="rounded-[10px] p-[0.2em]"
            style={{ background: "rgba(var(--text__background-rgb), 1)" }}
        >
          <div
            className="rounded-[8px] h-[2.75em] w-[2.75em] bg-white flex items-center justify-center"
            style={{
              boxShadow: "0 1px 2px 0 rgba(var(--text__font-rgb), 0.5)",
              color: "rgba(var(--text__font-rgb), 1)",
            }}
          >
            <Icon size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="pill bg-[var(--secondary)] text-[var(--primary)] inline-block">
            {pill}
          </div>
          <div className="flex items-center gap-1.25 mt-0.5">
            <div className="font-semibold text-sm min-w-0">
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
                  className="nodrag nopan w-full focus:outline-none border-none bg-transparent text-sm font-semibold"
                />
              ) : (
                <div
                  onDoubleClick={() => setEditingName(true)}
                  className="cursor-pointer truncate"
                  title="Double-click to rename"
                >
                  {displayName}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-[var(--font--light)] hover:text-[var(--primary)] transition-colors flex-shrink-0"
              aria-label="Rename"
            >
              <PencilLine size={14} />
            </button>
          </div>
        </div>
      </div>
    </NodeFrame>
  );
}
