"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

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

export const edgeTypes = {
  deletable: DeletableEdge,
};
