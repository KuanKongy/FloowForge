"use client";

import { type NodeProps } from "@xyflow/react";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { useNodeRunState, runStateClass } from "../run-state-context";
import { useInScope } from "../order-context";

/**
 * Direct port of Floowbox's `ButtonNode`. Just a round pink "Click Me" button
 * — no surrounding card.
 *
 * Two-mode behavior:
 * - Frontend mode: button is **clickable** (fires the trigger). We add the
 *   `nodrag nopan` classes so React Flow doesn't try to drag the node out
 *   from under the user when they click.
 * - Backend mode: clicks do nothing, but the entire button is draggable so
 *   the user can rearrange it on the canvas. We omit `nodrag` here.
 */
export default function ButtonNode({ id, data, isConnectable }: NodeProps) {
  const {
    onTrigger,
    label = "Click Me",
    isFrontend = true,
  } = data as {
    onTrigger?: (id: string) => void;
    label?: string;
    isFrontend?: boolean;
  };
  const state = useNodeRunState(id);
  const inScope = useInScope(id);

  const interactive = isFrontend;

  return (
    <div
      className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}
    >
      <NodeHandleWrapper id={id} type="text" isConnectable={isConnectable} hidden={false}>
        <button
          type="button"
          onClick={interactive ? () => onTrigger?.(id) : undefined}
          onMouseDown={interactive ? (e) => e.stopPropagation() : undefined}
          className={`button-node text-white text-[1.05rem] h-[3em] px-[1.9em] rounded-[50em] transition-transform ${
            interactive
              ? "nodrag nopan hover:scale-[1.04] active:scale-[0.98] cursor-pointer"
              : "cursor-grab active:cursor-grabbing"
          }`}
          aria-disabled={!interactive}
          title={interactive ? "Click to run flow from this trigger" : "Switch to Frontend to click; drag to move"}
        >
          {label}
        </button>
      </NodeHandleWrapper>
    </div>
  );
}
