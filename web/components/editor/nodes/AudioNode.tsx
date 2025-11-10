"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import WaveSurfer from "wavesurfer.js";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";


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


function groupFileAssetStatusByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countFileAssetStatusByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export default function AudioNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value } = data as { isFrontend?: boolean; value?: string };
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

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

  return (
    <NodeFrame
      id={id}
      type="audio"
      isConnectable={isConnectable}
      hidden={isFrontend}
      defaultName="Audio Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[450px]"
    >
      <div className="h-[64px] flex items-center px-2 gap-3">
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


const fileassetworkerTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveFileAssetWorkerTone(status: string | undefined): keyof typeof fileassetworkerTone {
  if (status && status in fileassetworkerTone) return status as keyof typeof fileassetworkerTone;
  return 'queued';
}

