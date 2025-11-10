"use client";

import { Play } from "lucide-react";
import { useResumeContext } from "./resume-context";

/**
 * When the editor is in "resume mode", every non-trigger node draws this
 * overlay across its card. Clicking it asks the editor to start a fresh run
 * from this node onward (`start_node_ids=[id]`). The current canvas values
 * (textboxes, AI prompts, etc.) are saved by the editor's `runFlow` flush
 * before kicking off, so the resumed run picks up the user's latest fixed
 * inputs.
 */
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
