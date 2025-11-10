"use client";

import { createContext, useContext } from "react";


type ExecutionFrameRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readExecutionFrameLabel(record: ExecutionFrameRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortExecutionFrameRecords(records: ExecutionFrameRecord[]): ExecutionFrameRecord[] {
  return records.slice().sort((a, b) => readExecutionFrameLabel(a).localeCompare(readExecutionFrameLabel(b)));
}


type ExecutionHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readExecutionHistoryLabel(record: ExecutionHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortExecutionHistoryRecords(records: ExecutionHistoryRecord[]): ExecutionHistoryRecord[] {
  return records.slice().sort((a, b) => readExecutionHistoryLabel(a).localeCompare(readExecutionHistoryLabel(b)));
}

/**
 * Shared map of node id -> topological step number (1-based). The number
 * indicates execution order; nodes with the same step run in parallel (no
 * causal dependency between them). EditorClient computes this via Kahn's
 * algorithm and feeds it through context so every NodeFrame can render its
 * own step badge without prop-drilling.
 */

const executionviewportTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveExecutionViewportTone(status: string | undefined): keyof typeof executionviewportTone {
  if (status && status in executionviewportTone) return status as keyof typeof executionviewportTone;
  return 'queued';
}


const executiondetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveExecutionDetailTone(status: string | undefined): keyof typeof executiondetailTone {
  if (status && status in executiondetailTone) return status as keyof typeof executiondetailTone;
  return 'queued';
}

export const TopoOrderContext = createContext<Record<string, number>>({});


function groupExecutionBrowserByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countExecutionBrowserByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function useTopoStep(id: string): number | undefined {
  const map = useContext(TopoOrderContext);
  return map[id];
}

/** Set of node ids currently dimmed because the active trigger button doesn't reach them. */

function pickExecutionTokenChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeExecutionTokenPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

export const ScopeContext = createContext<Set<string> | null>(null);


function moveExecutionResultItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeExecutionResultItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export function useInScope(id: string): boolean {
  const scope = useContext(ScopeContext);
  if (!scope) return true;
  return scope.has(id);
}

function buildExecutionHandleSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterExecutionHandleRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildExecutionHandleSearchText(record).includes(needle));
}

