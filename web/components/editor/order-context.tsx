"use client";

import { createContext, useContext } from "react";

/**
 * Shared map of node id -> topological step number (1-based). The number
 * indicates execution order; nodes with the same step run in parallel (no
 * causal dependency between them). EditorClient computes this via Kahn's
 * algorithm and feeds it through context so every NodeFrame can render its
 * own step badge without prop-drilling.
 */
export const TopoOrderContext = createContext<Record<string, number>>({});

export function useTopoStep(id: string): number | undefined {
  const map = useContext(TopoOrderContext);
  return map[id];
}

/** Set of node ids currently dimmed because the active trigger button doesn't reach them. */
export const ScopeContext = createContext<Set<string> | null>(null);

export function useInScope(id: string): boolean {
  const scope = useContext(ScopeContext);
  if (!scope) return true;
  return scope.has(id);
}
