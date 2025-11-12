"use client";

import { Image as ImageIcon } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { BackendBox } from "../BackendBox";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";

export default function ImageNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value } = data as { isFrontend?: boolean; value?: string };
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, { defaultName: "Image Box", data: data as Record<string, unknown> });

  if (!isFrontend) {
    return (
      <div className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}>
        <div className="backend-shell backend-shell--image" style={{ width: "36em", height: "386px" }}>
          <NodeHandleWrapper id={id} type="image" isConnectable={isConnectable} hidden={false}>
            <BackendBox kind="image" icon={<ImageIcon size={20} strokeWidth={1.5} />} label={ctrl.name} />
          </NodeHandleWrapper>
        </div>
        {step !== undefined && <span className="topo-badge" aria-label={`Step ${step}`}>{step}</span>}
        {ctrl.renderWaitChip("top")}
        <ResumeOverlay nodeId={id} />
      </div>
    );
  }

  return (
    <NodeFrame
      id={id}
      type="image"
      isConnectable={isConnectable}
      hidden={true}
      defaultName="Image Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[36em]"
    >
      <div className="h-[340px]">
        {value ? (
          <div className="rounded-[14px] overflow-hidden h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="generated" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="rounded-[14px] h-full bg-[var(--surface-3)] flex flex-col items-center justify-center text-[var(--font--light)] gap-2">
            <ImageIcon size={64} strokeWidth={1.3} />
            <span>When an image is ready, it will appear here.</span>
          </div>
        )}
      </div>
    </NodeFrame>
  );
}
