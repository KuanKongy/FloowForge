"use client";

import { Handle, Position, useStore, useConnection } from "@xyflow/react";
import React, { useEffect, useRef, useState } from "react";

const DIRS = ["top", "right", "bottom", "left"] as const;
type Dir = (typeof DIRS)[number];

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
