"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import WaveSurfer from "wavesurfer.js";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { BackendBox } from "../BackendBox";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";

export default function AudioNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value } = data as { isFrontend?: boolean; value?: string };
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, { defaultName: "Audio Box", data: data as Record<string, unknown> });

  useEffect(() => {
    if (!containerRef.current || !value) {
      wsRef.current?.destroy();
      wsRef.current = null;
      return;
    }
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: value,
      height: 36,
      waveColor: "#cbd5e1",
      progressColor: "var(--primary)",
      cursorColor: "var(--primary)",
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });
    wsRef.current = ws;
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [value]);

  if (!isFrontend) {
    return (
      <div className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}>
        <NodeHandleWrapper id={id} type="audio" isConnectable={isConnectable} hidden={false}>
          <div className="backend-shell backend-shell--audio" style={{ width: "450px", height: "114px" }}>
            <BackendBox kind="audio" icon={<AudioLines size={20} strokeWidth={1.5} />} label={ctrl.name} />
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
      type="audio"
      isConnectable={isConnectable}
      hidden={true}
      defaultName="Audio Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[450px]"
    >
      <div className="h-[68px] flex items-center px-2 gap-3">
        {value ? (
          <button
            type="button"
            aria-label={isPlaying ? "Pause audio" : "Play audio"}
            onClick={() => wsRef.current?.playPause()}
            onMouseDown={(e) => e.stopPropagation()}
            className="size-9 rounded-full bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-white transition-colors nodrag nopan"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
        ) : (
          <AudioLines size={20} style={{ color: "var(--audio__font)" }} />
        )}
        <div ref={containerRef} className="flex-1 min-w-0">
          {!value && (
            <span className="text-sm text-[var(--muted-foreground)]">No audio yet.</span>
          )}
        </div>
      </div>
    </NodeFrame>
  );
}
