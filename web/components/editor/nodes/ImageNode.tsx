"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Maximize2, X } from "lucide-react";
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
  const [zoomOpen, setZoomOpen] = useState(false);

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
          <button
            type="button"
            aria-label="Open image full size"
            onClick={() => setZoomOpen(true)}
            onMouseDown={(e) => e.stopPropagation()}
            className="group relative block w-full h-full rounded-[14px] overflow-hidden cursor-zoom-in nodrag nopan"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="generated" className="w-full h-full object-contain" />
            <span className="absolute top-2 right-2 flex items-center justify-center size-8 rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 size={15} />
            </span>
          </button>
        ) : (
          <div className="rounded-[14px] h-full bg-[var(--surface-3)] flex flex-col items-center justify-center text-[var(--font--light)] gap-2">
            <ImageIcon size={64} strokeWidth={1.3} />
            <span>When an image is ready, it will appear here.</span>
          </div>
        )}
      </div>
      {zoomOpen && value && <ImageLightbox src={value} onClose={() => setZoomOpen(false)} />}
    </NodeFrame>
  );
}

/**
 * Full-screen image preview. Rendered through a portal to `document.body`
 * because a React Flow node carries a CSS `transform`, which would otherwise
 * make this `fixed` overlay position relative to the node instead of the
 * viewport. Closes on backdrop click and Escape.
 */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/75 flex items-center justify-center p-6 nodrag nopan"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image preview"
        className="absolute top-4 right-4 flex items-center justify-center size-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Full size preview"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-[10px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
