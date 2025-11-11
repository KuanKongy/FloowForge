import { useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";

/**
 * Node types that act as **trigger / entry points** rather than work units.
 * They never get a step number badge — instead the first downstream non-
 * trigger node is "Step 1".
 *
 * Rationale: when a flow is launched via a webhook, public form, or by
 * clicking a different button, the user doesn't want the canvas numbering
 * to shift around. The visible numbers correspond to the actual processing
 * stages (input -> AI -> output), not to which trigger fired.
 */
const TRIGGER_NODE_TYPES = new Set(["button", "webhook_in", "manual_in", "header", "schedule_in"]);

/**
 * Compute step numbers for each node using Kahn's algorithm. Nodes that share
 * a layer share a number — visually conveying which nodes will run in
 * parallel (no path between them) and which have to wait.
 *
 * Trigger nodes (Button / Webhook In / Manual In) are intentionally **not**
 * given a step number; they are treated as level 0 entry points and the
 * first non-trigger nodes downstream become Step 1.
 *
 * Returns a map of nodeId -> 1-indexed step number. Trigger nodes are absent
 * from the map.
 */
export function useTopoOrder(nodes: Node[], edges: Edge[]): Record<string, number> {
  return useMemo(() => {
    if (nodes.length === 0) return {};

    const isTrigger = new Map<string, boolean>();
    nodes.forEach((n) => {
      isTrigger.set(n.id, TRIGGER_NODE_TYPES.has(n.type ?? ""));
    });

    const inDeg = new Map<string, number>();
    const children = new Map<string, string[]>();
    nodes.forEach((n) => {
      inDeg.set(n.id, 0);
      children.set(n.id, []);
    });
    edges.forEach((e) => {
      if (!inDeg.has(e.source) || !inDeg.has(e.target)) return;
      children.get(e.source)!.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    });

    // Kahn's: start frontier = roots. We also add trigger-only ancestors as
    // roots so their downstream subgraph still runs through Kahn's. Trigger
    // nodes themselves *do* participate in the traversal (otherwise their
    // children's in-degree never reaches 0 and downstream nodes never level)
    // but they don't receive a step number when we emit results.
    const layer = new Map<string, number>();
    let frontier = nodes.filter((n) => (inDeg.get(n.id) || 0) === 0).map((n) => n.id);
    let level = 0;
    const visited = new Set<string>();
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        layer.set(id, level);
        for (const c of children.get(id) || []) {
          inDeg.set(c, (inDeg.get(c) || 0) - 1);
          if ((inDeg.get(c) || 0) === 0 && !visited.has(c)) {
            next.push(c);
          }
        }
      }
      frontier = next;
      level += 1;
      if (level > nodes.length + 5) break; // cycle guard
    }

    // Renumber so the smallest level among **non-trigger** nodes becomes 1.
    // Triggers are dropped from the output.
    const nonTriggerLayers = new Set<number>();
    for (const [id, lvl] of layer.entries()) {
      if (!isTrigger.get(id)) nonTriggerLayers.add(lvl);
    }
    const sorted = [...nonTriggerLayers].sort((a, b) => a - b);
    const layerToStep = new Map<number, number>();
    sorted.forEach((lvl, idx) => layerToStep.set(lvl, idx + 1));

    const out: Record<string, number> = {};
    for (const [id, lvl] of layer.entries()) {
      if (isTrigger.get(id)) continue;
      const step = layerToStep.get(lvl);
      if (step !== undefined) out[id] = step;
    }
    return out;
  }, [nodes, edges]);
}

/** Forward-BFS scope from a set of trigger node ids, including the triggers. */
export function downstreamScope(
  triggerIds: string[],
  edges: Edge[]
): Set<string> {
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
  }
  const scope = new Set<string>();
  const queue = [...triggerIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (scope.has(id)) continue;
    scope.add(id);
    for (const c of children.get(id) || []) {
      if (!scope.has(c)) queue.push(c);
    }
  }
  return scope;
}
