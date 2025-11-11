"use client";

import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { BackendBox } from "../BackendBox";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";
import { useNodeFrameControls } from "../NodeFrame";

export default function TextNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value = "" } = data as { isFrontend?: boolean; value?: string };
  const rf = useReactFlow();
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, { defaultName: "Text Box", data: data as Record<string, unknown> });

  const [localValue, setLocalValue] = useState<string>(typeof value === "string" ? value : "");
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (typeof value === "string" && !isFocusedRef.current && value !== localValue) {
      setLocalValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function persist(next: string) {
    if (next !== value) {
      rf.updateNodeData(id, { value: next });
    }
  }

  if (!isFrontend) {
    return (
      <div className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}>
        <NodeHandleWrapper id={id} type="text" isConnectable={isConnectable} hidden={false}>
          <div className="backend-shell backend-shell--text" style={{ width: "36em", height: "252px" }}>
            <BackendBox kind="text" icon={<Type size={20} strokeWidth={1.5} />} label={ctrl.name} />
          </div>
        </NodeHandleWrapper>
        {step !== undefined && <span className="topo-badge" aria-label={`Step ${step}`}>{step}</span>}
        {ctrl.renderWaitChip("top")}
        <ResumeOverlay nodeId={id} />
      </div>
    );
  }

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={true}
      defaultName="Text Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[36em]"
    >
      <textarea
        className="w-full h-[200px] p-3 text-sm rounded-[14px] resize-none focus:outline-none bg-[var(--surface-2)] nodrag nopan overflow-y-auto"
        placeholder="Start typing here…"
        value={localValue}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          persist(next);
        }}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          persist(localValue);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      />
    </NodeFrame>
  );
}
