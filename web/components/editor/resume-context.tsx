"use client";

import { createContext, useContext } from "react";

/**
 * Resume mode context. When `enabled` is true, every non-trigger node renders
 * a small Play overlay; clicking it asks the editor to start a new run with
 * `start_node_ids=[that_node_id]`. The current node values (textareas, etc.)
 * are persisted by the regular `saveVersion()` step that ``runFlow`` already
 * triggers, so the per-node resume picks up the latest fixed inputs.
 */
export type ResumeContextValue = {
  enabled: boolean;
  resumeFromNode: (nodeId: string) => void;
};

export const ResumeContext = createContext<ResumeContextValue>({
  enabled: false,
  resumeFromNode: () => {},
});

export function useResumeContext(): ResumeContextValue {
  return useContext(ResumeContext);
}
