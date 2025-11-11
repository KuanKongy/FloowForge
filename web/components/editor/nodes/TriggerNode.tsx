"use client";

import { Webhook, MousePointerClick, CalendarClock } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";

/**
 * Visual entry-point markers for Webhook In / Manual In / Schedule In.
 * All trigger management (creating webhooks, schedules, forms) happens on the
 * Triggers page — these canvas nodes just mark where a branch begins.
 */
export default function TriggerNode({ id, type, data, isConnectable }: NodeProps) {
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  let Icon = MousePointerClick;
  let label = "Manual In";
  let pill = "Manual";
  if (type === "webhook_in") {
    Icon = Webhook;
    label = "Webhook In";
    pill = "Webhook";
  } else if (type === "schedule_in") {
    Icon = CalendarClock;
    label = "Schedule In";
    pill = "Schedule";
  }

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={false}
      defaultName={label}
      data={data as Record<string, unknown>}
      headerVariant="none"
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[18em]"
    >
      <div className="p-3 flex items-center gap-3">
        <div className="rounded-[10px] p-2 bg-[var(--secondary)] text-[var(--primary)]">
          <Icon size={20} />
        </div>
        <div>
          <div className="pill bg-[var(--secondary)] text-[var(--primary)] inline-block">
            {pill}
          </div>
          <div className="font-semibold mt-0.5 text-sm">{label}</div>
        </div>
      </div>
    </NodeFrame>
  );
}
