"use client";

import { CloudUpload, CircleX, FileText, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { BackendBox } from "../BackendBox";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";

type FilePayload = {
  kind: "file";
  name: string;
  mime: string;
  size: number;
  data_url: string;
};

const MAX_INLINE_FILE_BYTES = 25 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function FileNode({ id, data, isConnectable }: NodeProps) {
  const {
    isFrontend = true,
    fileName,
  } = data as { isFrontend?: boolean; fileName?: string };
  const rf = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, { defaultName: "File Box", data: data as Record<string, unknown> });

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > MAX_INLINE_FILE_BYTES) {
        throw new Error("File exceeds 25 MB limit");
      }
      const dataUrl = await readFileAsDataUrl(file);
      const payload: FilePayload = {
        kind: "file",
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        data_url: dataUrl,
      };
      rf.updateNodeData(id, {
        fileName: file.name,
        fileMime: payload.mime,
        fileSize: payload.size,
        value: payload,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isFrontend) {
    return (
      <div className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}>
        <div className="backend-shell backend-shell--file" style={{ width: "450px", height: "172px" }}>
          <NodeHandleWrapper id={id} type="file" isConnectable={isConnectable} hidden={false}>
            <BackendBox kind="file" icon={<Upload size={20} strokeWidth={1.5} />} label={ctrl.name} />
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
      type="file"
      isConnectable={isConnectable}
      hidden={true}
      defaultName="File Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[450px]"
    >
      <label
        className="block nodrag nopan"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input type="file" className="hidden" onChange={onChange} disabled={busy} />
        <div className="border border-dashed border-[var(--border)] rounded-[14px] py-6 flex flex-col items-center text-sm text-[var(--muted-foreground)] cursor-pointer hover:bg-[var(--muted)] transition-colors">
          {busy ? (
            <Loader2 size={48} strokeWidth={1.3} className="text-[var(--primary)] mb-2 animate-spin" />
          ) : fileName ? (
            <FileText size={48} strokeWidth={1.3} className="text-[var(--file__font)] mb-2" />
          ) : (
            <CloudUpload size={48} strokeWidth={1.3} className="text-[var(--font--light)] mb-2" />
          )}
          <div>
            {busy
              ? "Reading file…"
              : fileName
              ? "Replace file"
              : "Choose a file or drag & drop here."}
          </div>
          {fileName && !busy && (
            <div className="mt-2 text-[var(--foreground)] flex items-center gap-2">
              {fileName}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  rf.updateNodeData(id, {
                    fileName: undefined,
                    fileMime: undefined,
                    fileSize: undefined,
                    value: undefined,
                  });
                }}
                aria-label="Remove file"
                className="hover:text-[var(--primary)] transition-colors"
              >
                <CircleX size={14} />
              </button>
            </div>
          )}
          {error && <div className="mt-2 text-[var(--primary)] text-xs">{error}</div>}
        </div>
      </label>
    </NodeFrame>
  );
}
