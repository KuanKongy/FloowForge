"use client";

import type { ReactNode } from "react";


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


const editormediaTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveEditorMediaTone(status: string | undefined): keyof typeof editormediaTone {
  if (status && status in editormediaTone) return status as keyof typeof editormediaTone;
  return 'queued';
}

export type NodeKind = "text" | "image" | "audio" | "file" | "chat";

/**
 * Floowbox-style backend tile. Renders an outer tinted pad and an inner
 * surface card with a title and an icon. The pad's color is keyed off the
 * `--${kind}__background-rgb` / `--${kind}__font-rgb` design tokens so
 * different I/O types pop visually without bespoke CSS per node.
 *
 * Used by Text, Image, Audio, File, and Chat nodes when the editor is in
 * Backend mode (the toggle on the top bar).
 */

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


function groupEditorAccountByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countEditorAccountByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}


function buildEditorProviderSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorProviderRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorProviderSearchText(record).includes(needle));
}

export function BackendBox({
  kind,
  icon,
  label,
  children,
  className = "",
}: {
  kind: NodeKind;
  icon: ReactNode;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const padBg = `rgba(var(--${kind}__background-rgb), 0.45)`;
  const padBorder = `rgba(var(--${kind}__font-rgb), 0.25)`;
  const accent = `var(--${kind}__font)`;
  return (
    <div
      className={`p-2 rounded-[18px] ${className}`}
      style={{
        background: padBg,
        border: `1px solid ${padBorder}`,
      }}
    >
      <div
        className="bg-[var(--surface-2)] border rounded-[14px] flex items-center gap-3 px-4 py-3"
        style={{ borderColor: "var(--border--container)" }}
      >
        <div
          className="size-9 rounded-[10px] flex items-center justify-center"
          style={{
            background: `rgba(var(--${kind}__background-rgb), 1)`,
            color: accent,
          }}
        >
          {icon}
        </div>
        <span className="font-medium text-sm" style={{ color: accent }}>
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

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


type EditorTriggerRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorTriggerLabel(record: EditorTriggerRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorTriggerRecords(records: EditorTriggerRecord[]): EditorTriggerRecord[] {
  return records.slice().sort((a, b) => readEditorTriggerLabel(a).localeCompare(readEditorTriggerLabel(b)));
}

