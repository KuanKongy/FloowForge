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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export default function FileNode({ id, data, isConnectable }: NodeProps) {
  const {
    isFrontend = true,
    fileName,
    extracted,
  } = data as { isFrontend?: boolean; fileName?: string; extracted?: string };
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
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("pdf", file);
      const r = await fetch(`${API}/media/parse-pdf`, {
        method: "POST",
        body: fd,
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      const body = await r.json();
      rf.updateNodeData(id, {
        fileName: file.name,
        value: body.text || "",
        extracted: body.text || "",
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
        <NodeHandleWrapper id={id} type="file" isConnectable={isConnectable} hidden={false}>
          <div className="backend-shell backend-shell--file" style={{ width: "450px", height: "172px" }}>
            <BackendBox kind="file" icon={<Upload size={20} strokeWidth={1.5} />} label={ctrl.name} />
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
        <input type="file" className="hidden" onChange={onChange} disabled={busy} accept=".pdf" />
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
              ? "Uploading & parsing…"
              : fileName
              ? "Replace file"
              : "Choose a PDF or drag & drop here."}
          </div>
          {fileName && !busy && (
            <div className="mt-2 text-[var(--foreground)] flex items-center gap-2">
              {fileName}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  rf.updateNodeData(id, { fileName: undefined, value: undefined, extracted: undefined });
                }}
                aria-label="Remove file"
                className="hover:text-[var(--primary)] transition-colors"
              >
                <CircleX size={14} />
              </button>
            </div>
          )}
          {error && <div className="mt-2 text-[var(--primary)] text-xs">{error}</div>}
          {extracted && !busy && (
            <div className="mt-2 max-h-16 overflow-auto text-xs text-[var(--muted-foreground)] px-3">
              {(extracted as string).slice(0, 240)}
              {(extracted as string).length > 240 ? "…" : ""}
            </div>
          )}
        </div>
      </label>
    </NodeFrame>
  );
}
