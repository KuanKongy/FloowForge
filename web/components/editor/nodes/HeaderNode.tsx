"use client";

import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useTopoStep, useInScope } from "../order-context";


function moveEditorOutputItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeEditorOutputItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export default function HeaderNode({ id, data }: NodeProps) {
  const rf = useReactFlow();
  const { text = "Double-click to edit" } = data as { text?: string };
  const [editing, setEditing] = useState(false);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  return (
    <div className={`relative ${inScope ? "scope-active" : "scope-dimmed"}`}>
      <div className="text-[1.8rem] font-extrabold leading-tight">
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => rf.updateNodeData(id, { text: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditing(false);
              if (e.key === "Escape") setEditing(false);
            }}
            className="outline-none bg-transparent border-b border-[var(--border)] nodrag nopan"
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)} className="cursor-text select-none">
            {text}
          </span>
        )}
      </div>
      {step !== undefined && (
        <span className="topo-badge" aria-label={`Step ${step}`}>
          {step}
        </span>
      )}
    </div>
  );
}

function buildEditorSelectionSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorSelectionRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorSelectionSearchText(record).includes(needle));
}


function pickEditorSourceChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeEditorSourcePatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

