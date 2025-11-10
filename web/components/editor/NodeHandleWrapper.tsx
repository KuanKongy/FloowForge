"use client";

import { Handle, Position, useStore, useConnection } from "@xyflow/react";
import React, { useEffect, useRef, useState } from "react";


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

const DIRS = ["top", "right", "bottom", "left"] as const;

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

type Dir = (typeof DIRS)[number];


type EditorPanelRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorPanelLabel(record: EditorPanelRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorPanelRecords(records: EditorPanelRecord[]): EditorPanelRecord[] {
  return records.slice().sort((a, b) => readEditorPanelLabel(a).localeCompare(readEditorPanelLabel(b)));
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

const POS: Record<Dir, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * Wraps a node body and surfaces React Flow handles on each side. Behavior:
 *
 * 1. **Proximity reveal** — when the mouse is within `threshold` px of a side
 *    that has no connection yet, the source handle (cyan-bordered ring) fades
 *    in so the user can drag a new edge from there.
 * 2. **Target reveal during drag** — when another node is dragging an edge
 *    out, every other node's target handles light up so the user can drop
 *    onto any side.
 * 3. **In-use direction indicators** — if a side already participates in an
 *    edge, a small persistent dot shows that side is "occupied" (cyan for
 *    source-side, magenta for target-side). This is the explicit user ask.
 * 4. **Hidden mode** — when `hidden` is true (e.g. Frontend mode), no handles
 *    or indicators render. Edges still draw on the canvas because React Flow
 *    is the source of truth.
 */

const editorworkerTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveEditorWorkerTone(status: string | undefined): keyof typeof editorworkerTone {
  if (status && status in editorworkerTone) return status as keyof typeof editorworkerTone;
  return 'queued';
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

export function NodeHandleWrapper({
  id,
  type,
  isConnectable,
  threshold = 50,
  hidden = false,
  children,
}: {
  id: string;
  type: string;
  isConnectable: boolean;
  threshold?: number;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [closest, setClosest] = useState<Dir | null>(null);
  const edges = useStore((s) => s.edges);
  const connection = useConnection();

  const showTargets = !!(connection && connection.inProgress && connection.fromNode?.id !== id);

  useEffect(() => {
    if (showTargets || hidden) {
      setClosest(null);
      return;
    }
    function onMove(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const positions: Record<Dir, [number, number]> = {
        top: [cx, rect.top],
        right: [rect.right, cy],
        bottom: [cx, rect.bottom],
        left: [rect.left, cy],
      };
      let best: Dir | null = null;
      let bestDist = Infinity;
      for (const d of DIRS) {
        const [x, y] = positions[d];
        const dx = x - e.clientX;
        const dy = y - e.clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      setClosest(bestDist <= threshold ? best : null);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [showTargets, threshold, hidden]);

  return (
    <div ref={containerRef} className="relative">
      {children}
      {DIRS.map((dir) => {
        const sourceHandleId = `node-source-${dir}-${id}-${type}`;
        const targetHandleId = `node-target-${dir}-${id}-${type}`;
        const sourceConnected = edges.some(
          (e) => e.source === id && e.sourceHandle === sourceHandleId
        );
        const targetConnected = edges.some(
          (e) => e.target === id && e.targetHandle === targetHandleId
        );
        const sourceActive =
          connection &&
          connection.inProgress &&
          connection.fromNode?.id === id &&
          connection.fromHandle?.id === sourceHandleId;
        const showTarget = (targetConnected || showTargets) && !hidden;
        const showSource =
          (sourceConnected || sourceActive || (closest === dir && !targetConnected)) && !hidden;

        return (
          <React.Fragment key={dir}>
            <Handle
              type="target"
              position={POS[dir]}
              isConnectable={isConnectable}
              id={targetHandleId}
              style={{
                background: "white",
                border: `1px solid var(--${type}__font, var(--primary))`,
                width: "0.9em",
                height: "0.9em",
                opacity: showTarget ? 1 : 0,
                pointerEvents: showTarget ? "auto" : "none",
                transition: "opacity 0.2s",
              }}
            />
            <Handle
              type="source"
              position={POS[dir]}
              isConnectable={isConnectable}
              id={sourceHandleId}
              style={{
                background: "white",
                border: `1px solid var(--${type}__font, var(--primary))`,
                width: "0.9em",
                height: "0.9em",
                opacity: showSource ? 1 : 0,
                pointerEvents: showSource ? "auto" : "none",
                transition: "opacity 0.2s",
              }}
            />
            {!hidden && targetConnected && (
              <span className={`direction-indicator direction-indicator--target direction-indicator--${dir}`} />
            )}
            {!hidden && sourceConnected && !targetConnected && (
              <span className={`direction-indicator direction-indicator--source direction-indicator--${dir}`} />
            )}
          </React.Fragment>
        );
      })}
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

