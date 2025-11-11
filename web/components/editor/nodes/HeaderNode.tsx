"use client";

import { useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";

/**
 * Decorative header node — purely visual, does not participate in the
 * execution flow or topological ordering.
 */
export default function HeaderNode({ id, data }: NodeProps) {
  const rf = useReactFlow();
  const { text = "Double-click to edit" } = data as { text?: string };
  const [editing, setEditing] = useState(false);

  return (
    <div className="relative">
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
    </div>
  );
}
