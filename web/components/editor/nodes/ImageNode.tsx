"use client";

import { Image as ImageIcon } from "lucide-react";
import { type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";


type FileAssetCanvasRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readFileAssetCanvasLabel(record: FileAssetCanvasRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortFileAssetCanvasRecords(records: FileAssetCanvasRecord[]): FileAssetCanvasRecord[] {
  return records.slice().sort((a, b) => readFileAssetCanvasLabel(a).localeCompare(readFileAssetCanvasLabel(b)));
}


function moveFileAssetOutputItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeFileAssetOutputItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export default function ImageNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value } = data as { isFrontend?: boolean; value?: string };
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  return (
    <NodeFrame
      id={id}
      type="image"
      isConnectable={isConnectable}
      hidden={isFrontend}
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

function buildFileAssetSelectionSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterFileAssetSelectionRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildFileAssetSelectionSearchText(record).includes(needle));
}

