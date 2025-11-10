"use client";

import { createContext, useContext } from "react";

export type NodeRunState = "idle" | "running" | "succeeded" | "failed" | "skipped";

export const RunStateContext = createContext<Record<string, NodeRunState>>({});

export function useNodeRunState(id: string): NodeRunState {
  const map = useContext(RunStateContext);
  return map[id] || "idle";
}

export function runStateClass(state: NodeRunState): string {
  if (state === "running") return "run-state-running";
  if (state === "succeeded") return "run-state-succeeded";
  if (state === "failed") return "run-state-failed";
  if (state === "skipped") return "opacity-60";
  return "";
}
