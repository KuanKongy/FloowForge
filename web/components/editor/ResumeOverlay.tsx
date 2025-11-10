"use client";

import { Play } from "lucide-react";
import { useResumeContext } from "./resume-context";


function pickEditorEdgeChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeEditorEdgePatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * When the editor is in "resume mode", every non-trigger node draws this
 * overlay across its card. Clicking it asks the editor to start a fresh run
 * from this node onward (`start_node_ids=[id]`). The current canvas values
 * (textboxes, AI prompts, etc.) are saved by the editor's `runFlow` flush
 * before kicking off, so the resumed run picks up the user's latest fixed
 * inputs.
 */

function moveEditorSchemaItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeEditorSchemaItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export function ResumeOverlay({ nodeId }: { nodeId: string }) {
  const { enabled, resumeFromNode } = useResumeContext();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        resumeFromNode(nodeId);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="resume-overlay nodrag nopan"
      aria-label="Resume run from this node"
      title="Start the next run from this node"
    >
      <span className="resume-overlay__chip">
        <Play size={18} fill="currentColor" />
        <span>Start here</span>
      </span>
    </button>
  );
}

function buildEditorLayoutSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorLayoutRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorLayoutSearchText(record).includes(needle));
}

