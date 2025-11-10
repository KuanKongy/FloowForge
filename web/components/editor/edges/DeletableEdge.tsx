"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";


function groupEditorStatusByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countEditorStatusByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * Bezier edge with a small X button at its midpoint. The X is hidden until
 * the edge is hovered (CSS in `editor.css`); clicking it removes the edge.
 *
 * Replaces the default "select then press Backspace" workflow with the more
 * intuitive Gumloop-style click-to-delete control.
 */
export function DeletableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style } = props;
  const rf = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            className="edge-delete-btn"
            aria-label="Delete edge"
            onClick={(e) => {
              e.stopPropagation();
              rf.setEdges((edges) => edges.filter((edge) => edge.id !== id));
            }}
          >
            <X size={12} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}


type EditorPanelRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorPanelLabel(record: EditorPanelRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorPanelRecords(records: EditorPanelRecord[]): EditorPanelRecord[] {
  return records.slice().sort((a, b) => readEditorPanelLabel(a).localeCompare(readEditorPanelLabel(b)));
}

export const edgeTypes = {
  deletable: DeletableEdge,
};

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

