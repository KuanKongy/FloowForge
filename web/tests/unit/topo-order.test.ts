import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { downstreamScope, useTopoOrder } from "@/components/editor/use-topo-order";
import { renderHook } from "@testing-library/react";

const node = (id: string, type = "textbox"): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {},
});

describe("useTopoOrder (Kahn-step)", () => {
  it("returns step=1 for a single isolated node", () => {
    const { result } = renderHook(() => useTopoOrder([node("a")], []));
    expect(result.current).toEqual({ a: 1 });
  });

  it("orders a linear chain a -> b -> c -> d", () => {
    const nodes = ["a", "b", "c", "d"].map(node);
    const edges: Edge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "b", target: "c" },
      { id: "3", source: "c", target: "d" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("places independent nodes at the same step", () => {
    const nodes = ["a", "b", "c"].map(node);
    const edges: Edge[] = [
      { id: "1", source: "a", target: "c" },
      { id: "2", source: "b", target: "c" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current.a).toBe(1);
    expect(result.current.b).toBe(1);
    expect(result.current.c).toBe(2);
  });

  it("handles a diamond: a -> {b, c} -> d", () => {
    const nodes = ["a", "b", "c", "d"].map(node);
    const edges: Edge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "a", target: "c" },
      { id: "3", source: "b", target: "d" },
      { id: "4", source: "c", target: "d" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current).toEqual({ a: 1, b: 2, c: 2, d: 3 });
  });

  it("omits Button / Webhook / Manual triggers and renumbers", () => {
    const nodes: Node[] = [
      node("btn", "button"),
      node("text", "textbox"),
      node("textAi", "llm"),
      node("imgAi", "imagegen"),
      node("out", "textbox"),
    ];
    const edges: Edge[] = [
      { id: "1", source: "btn", target: "text" },
      { id: "2", source: "text", target: "textAi" },
      { id: "3", source: "textAi", target: "imgAi" },
      { id: "4", source: "imgAi", target: "out" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current.btn).toBeUndefined();
    expect(result.current).toEqual({ text: 1, textAi: 2, imgAi: 3, out: 4 });
  });

  it("renumbers when triggers are absent (no shift)", () => {
    const nodes: Node[] = [node("a"), node("b"), node("c")];
    const edges: Edge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "b", target: "c" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("multiple buttons fan into the same first work step", () => {
    const nodes: Node[] = [
      node("btnA", "button"),
      node("btnB", "button"),
      node("textAi", "llm"),
    ];
    const edges: Edge[] = [
      { id: "1", source: "btnA", target: "textAi" },
      { id: "2", source: "btnB", target: "textAi" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current.btnA).toBeUndefined();
    expect(result.current.btnB).toBeUndefined();
    expect(result.current.textAi).toBe(1);
  });

  it("does not crash on a cycle (graceful exit)", () => {
    const nodes = ["a", "b"].map(node);
    const edges: Edge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "b", target: "a" },
    ];
    const { result } = renderHook(() => useTopoOrder(nodes, edges));
    expect(result.current).toEqual({});
  });
});

describe("downstreamScope", () => {
  it("scope from a single trigger covers transitive descendants", () => {
    const edges: Edge[] = [
      { id: "1", source: "trigger", target: "b" },
      { id: "2", source: "b", target: "c" },
      { id: "3", source: "outsider", target: "d" },
    ];
    const scope = downstreamScope(["trigger"], edges);
    expect(scope.has("trigger")).toBe(true);
    expect(scope.has("b")).toBe(true);
    expect(scope.has("c")).toBe(true);
    expect(scope.has("outsider")).toBe(false);
    expect(scope.has("d")).toBe(false);
  });

  it("multiple triggers union their scopes", () => {
    const edges: Edge[] = [
      { id: "1", source: "t1", target: "x" },
      { id: "2", source: "t2", target: "y" },
    ];
    const scope = downstreamScope(["t1", "t2"], edges);
    expect(Array.from(scope).sort()).toEqual(["t1", "t2", "x", "y"]);
  });

  it("returns empty scope for empty triggers", () => {
    const scope = downstreamScope([], []);
    expect(scope.size).toBe(0);
  });
});
