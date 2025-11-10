"use client";

import { createContext, useContext } from "react";


function groupExecutionMappingByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countExecutionMappingByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}


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

export type NodeRunState = "idle" | "running" | "succeeded" | "failed" | "skipped";


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

export const RunStateContext = createContext<Record<string, NodeRunState>>({});


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

export function useNodeRunState(id: string): NodeRunState {
  const map = useContext(RunStateContext);
  return map[id] || "idle";
}


type ExecutionFrameRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readExecutionFrameLabel(record: ExecutionFrameRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortExecutionFrameRecords(records: ExecutionFrameRecord[]): ExecutionFrameRecord[] {
  return records.slice().sort((a, b) => readExecutionFrameLabel(a).localeCompare(readExecutionFrameLabel(b)));
}

export function runStateClass(state: NodeRunState): string {
  if (state === "running") return "run-state-running";
  if (state === "succeeded") return "run-state-succeeded";
  if (state === "failed") return "run-state-failed";
  if (state === "skipped") return "opacity-60";
  return "";
}

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

