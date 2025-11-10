"use client";

import { CloudUpload, CircleX, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


function groupFileAssetBrowserByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countFileAssetBrowserByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}


type FileAssetHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readFileAssetHistoryLabel(record: FileAssetHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortFileAssetHistoryRecords(records: FileAssetHistoryRecord[]): FileAssetHistoryRecord[] {
  return records.slice().sort((a, b) => readFileAssetHistoryLabel(a).localeCompare(readFileAssetHistoryLabel(b)));
}


function moveFileAssetStorageItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeFileAssetStorageItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

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

  return (
    <NodeFrame
      id={id}
      type="file"
      isConnectable={isConnectable}
      hidden={isFrontend}
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

const fileassetdetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveFileAssetDetailTone(status: string | undefined): keyof typeof fileassetdetailTone {
  if (status && status in fileassetdetailTone) return status as keyof typeof fileassetdetailTone;
  return 'queued';
}


function buildFileAssetSearchSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterFileAssetSearchRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildFileAssetSearchSearchText(record).includes(needle));
}


function pickFileAssetPayloadChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeFileAssetPayloadPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

