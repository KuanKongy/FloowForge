"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./editor.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { Ghost } from "lucide-react";

import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Flow, FlowVersion, NodeType } from "@flowforge/shared";

import { EditorTopBar } from "./EditorTopBar";
import { EditorPalette, PALETTE_DRAG_MIME } from "./EditorPalette";
import { RunHistoryPanel } from "./RunHistoryPanel";
import { RunSidebar, type RunEvent as SidebarEvent } from "./RunSidebar";
import { RunStateContext, type NodeRunState } from "./run-state-context";
import { TopoOrderContext, ScopeContext } from "./order-context";
import { ResumeContext } from "./resume-context";
import { useTopoOrder, downstreamScope } from "./use-topo-order";
import { edgeTypes } from "./edges/DeletableEdge";

// Cheap nodes are static-imported so they paint immediately. Heavy ones
// (wavesurfer for audio, the AI model panel with its sliders, the markdown-y
// custom node selector) are split into their own chunks so the initial
// editor route stays small and navigation feels snappier.
import TextNode from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import HeaderNode from "./nodes/HeaderNode";
import ButtonNode from "./nodes/ButtonNode";
import TriggerNode from "./nodes/TriggerNode";

const AudioNode = dynamic(() => import("./nodes/AudioNode"), { ssr: false });
const FileNode = dynamic(() => import("./nodes/FileNode"), { ssr: false });
const ChatNode = dynamic(() => import("./nodes/ChatNode"), { ssr: false });
const AIModelNode = dynamic(() => import("./nodes/AIModelNode"), { ssr: false });
const SubflowNode = dynamic(() => import("./nodes/SubflowNode"), { ssr: false });
const PromptTemplateNode = dynamic(() => import("./nodes/PromptTemplateNode"), { ssr: false });

const nodeTypes = {
  textbox: TextNode,
  imagebox: ImageNode,
  audiobox: AudioNode,
  filebox: FileNode,
  chatbox: ChatNode,
  header: HeaderNode,
  button: ButtonNode,
  llm: AIModelNode,
  imagegen: AIModelNode,
  audiogen: AIModelNode,
  fileparser: AIModelNode,
  subflow: SubflowNode,
  prompt_template: PromptTemplateNode,
  webhook_in: TriggerNode,
  manual_in: TriggerNode,
  schedule_in: TriggerNode,
} as const;

const AI_TYPES = new Set<NodeType>(["llm", "imagegen", "audiogen", "fileparser"]);
const TRIGGER_TYPES = new Set<NodeType>(["button", "webhook_in", "manual_in", "schedule_in"]);
/** The middle-ellipsis marker the executor writes when it trims a large value
 * before persisting it to ``run_events``. Such a value is a lossy preview, not
 * something we can render — an inline data URL cut this way yields a broken
 * <img>. */
const TRUNCATION_MARKER = "…(+";

function isTruncatedPayload(value: unknown): boolean {
  if (typeof value === "string") return value.includes(TRUNCATION_MARKER);
  if (Array.isArray(value)) return value.some(isTruncatedPayload);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(isTruncatedPayload);
  }
  return false;
}

/** Display nodes that should mirror the executor's output back into their
 * own ``data.value`` so the canvas reflects the current run's result. */
const DISPLAY_TYPES = new Set<NodeType>([
  "textbox",
  "imagebox",
  "audiobox",
  "filebox",
  "chatbox",
]);

export default function EditorClient({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <Editor flowId={flowId} />
    </ReactFlowProvider>
  );
}

function Editor({ flowId }: { flowId: string }) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [version, setVersion] = useState<FlowVersion | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isFrontend, setIsFrontend] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runStates, setRunStates] = useState<Record<string, NodeRunState>>({});
  const [runEvents, setRunEvents] = useState<SidebarEvent[]>([]);
  const [activeTriggerId, setActiveTriggerId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [systemStatus, setSystemStatus] = useState<
    "idle" | "running" | "succeeded" | "failed" | "cancelled"
  >("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStart, setRunStart] = useState<number | null>(null);
  const [runEnd, setRunEnd] = useState<number | null>(null);
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const runFlowRef = useRef<(startIds?: string[]) => Promise<void>>(async () => {});
  const rf = useReactFlow();

  const onTriggerButton = useCallback((id: string) => {
    setActiveTriggerId(id);
    setShowSidebar(true);
    void runFlowRef.current([id]);
  }, []);

  /** Mirror an executor output into the matching canvas node's ``data.value``
   * so Text / Image / Audio / Chat / File nodes display the result. We only
   * touch display-type nodes; AI / Trigger / utility nodes are left alone. */
  const applyOutputToDisplayNode = useCallback(
    (nodeId: string, output: unknown) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          if (!DISPLAY_TYPES.has(n.type as NodeType)) return n;
          const prev = (n.data || {}) as Record<string, unknown>;
          if (n.type === "filebox") {
            if (
              output &&
              typeof output === "object" &&
              (output as Record<string, unknown>).kind === "file" &&
              !("data_url" in (output as Record<string, unknown>))
            ) {
              return n;
            }
          }
          if (n.type === "chatbox" && Array.isArray(output)) {
            const mode = typeof prev.memory_mode === "string" ? prev.memory_mode : prev.memory_enabled === false ? "keep" : "update";
            if (mode !== "update") return n;
            const messages = (output as Array<{ role?: string; content?: string }>).filter(
              (m) => m.role !== "system"
            );
            return { ...n, data: { ...prev, messages } };
          }
          return { ...n, data: { ...prev, value: output } };
        })
      );
    },
    [setNodes]
  );

  const applyAiOutputToParentChats = useCallback(
    (nodeId: string, content: string) => {
      const parentChatIds = new Set(
        edges
          .filter((e) => e.target === nodeId)
          .map((e) => e.source)
      );
      if (parentChatIds.size === 0) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (!parentChatIds.has(n.id) || n.type !== "chatbox") return n;
          const prev = (n.data || {}) as Record<string, unknown>;
          const mode = typeof prev.memory_mode === "string" ? prev.memory_mode : prev.memory_enabled === false ? "keep" : "update";
          if (mode === "keep") return n;
          if (mode === "wipe") return { ...n, data: { ...prev, messages: [] } };
          const messages = Array.isArray(prev.messages)
            ? [...(prev.messages as Array<{ role: string; content: string }>)]
            : [];
          if (messages.at(-1)?.role === "assistant" && messages.at(-1)?.content === content) {
            return n;
          }
          messages.push({ role: "assistant", content });
          return { ...n, data: { ...prev, messages } };
        })
      );
    },
    [edges, setNodes]
  );

  // ---- Load flow + latest version -----------------------------------------
  useEffect(() => {
    apiGet<{ flow: Flow; versions: FlowVersion[] }>(`/flows/${flowId}`).then(({ flow, versions }) => {
      setFlow(flow);
      const latest = versions[0];
      if (latest) {
        setVersion(latest);
        const graph = latest.graph;
        // Hydrate with the **current** isFrontend flag so AI nodes that should
        // be hidden never flash visible after a flow load. The visibility
        // effect below keeps things in sync if the user toggles afterward.
        const initialFrontend = isFrontend;
        const hydratedNodes: Node[] = (graph.nodes || []).map((n) => {
          const isAi = AI_TYPES.has(n.type as NodeType);
          const display: CSSProperties["display"] = isAi && initialFrontend ? "none" : "block";
          const pointerEvents: CSSProperties["pointerEvents"] =
            isAi && initialFrontend ? "none" : "auto";
          return {
            id: n.id,
            type: n.type,
            position: n.position,
            style: isAi ? { display, pointerEvents } : undefined,
            data: {
              ...n.data,
              isFrontend: initialFrontend,
              ...(TRIGGER_TYPES.has(n.type as NodeType)
                ? { onTrigger: onTriggerButton, flow_id: flowId }
                : {}),
            },
          };
        });
        const hydratedEdges: Edge[] = (graph.edges || []).map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          animated: true,
          type: "deletable",
        }));
        setNodes(hydratedNodes);
        setEdges(hydratedEdges);
      }
    });
    // We intentionally do not depend on `isFrontend` here: the visibility
    // effect below handles toggle changes; this effect must only run on
    // mount / flowId change to avoid wiping unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, setNodes, setEdges, onTriggerButton]);

  // ---- Frontend/Backend visibility ----------------------------------------
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const nextNodes = nds.map((n) => {
        const data = (n.data || {}) as Record<string, unknown>;
        const nextData = data.isFrontend === isFrontend ? n.data : { ...data, isFrontend };
        if (nextData !== n.data) changed = true;
        if (!AI_TYPES.has(n.type as NodeType)) {
          return nextData === n.data ? n : { ...n, data: nextData };
        }
        const nextDisplay: CSSProperties["display"] = isFrontend ? "none" : "block";
        const nextPointerEvents: CSSProperties["pointerEvents"] = isFrontend ? "none" : "auto";
        const style = n.style || {};
        const styleUnchanged =
          style.display === nextDisplay && style.pointerEvents === nextPointerEvents;
        if (styleUnchanged && nextData === n.data) return n;
        changed = true;
        return {
          ...n,
          style: { ...style, display: nextDisplay, pointerEvents: nextPointerEvents },
          data: nextData,
        };
      });
      return changed ? nextNodes : nds;
    });
  }, [isFrontend, setNodes]);

  // ---- Realtime subscription ----------------------------------------------
  useEffect(() => {
    if (!activeRunId) return;
    let alive = true;
    apiGet<{
      run: { status?: string; ended_at?: string | null; created_at?: string; output?: unknown };
      events: SidebarEvent[];
    }>(`/runs/${activeRunId}`)
      .then((detail) => {
        if (!alive) return;
        const events = (detail.events || []).map((e) => ({
          kind: e.kind,
          node_id: e.node_id,
          payload: e.payload || {},
          duration_ms: e.duration_ms ?? null,
          ts: e.ts,
        }));
        setRunEvents(events);
        const states: Record<string, NodeRunState> = {};
        events.forEach((e) => {
          if (!e.node_id) return;
          if (e.kind === "node_started") states[e.node_id] = "running";
          else if (e.kind === "node_succeeded") states[e.node_id] = "succeeded";
          else if (e.kind === "node_failed") states[e.node_id] = "failed";
          else if (e.kind === "node_skipped") states[e.node_id] = "skipped";
        });
        setRunStates(states);
        const status = detail.run?.status;
        if (status === "succeeded" || status === "failed" || status === "cancelled") {
          setIsRunning(false);
          setSystemStatus(status);
          setRunEnd(detail.run?.ended_at ? new Date(detail.run.ended_at).getTime() : Date.now());
          if (status === "succeeded") {
            events.forEach((e) => {
              const out = (e.payload as Record<string, unknown> | undefined)?.output;
              if (e.kind !== "node_succeeded" || !e.node_id) return;
              // Restore results onto the canvas when a finished run is
              // reopened. Persisted event payloads are truncated by the
              // executor, so anything carrying the truncation marker (or a
              // legacy inline data URL, which is always truncated) is skipped
              // rather than rendered as a broken image.
              if (out !== undefined && !isTruncatedPayload(out)) {
                applyOutputToDisplayNode(e.node_id, out);
              }
              if (typeof out === "string") {
                applyAiOutputToParentChats(e.node_id, out);
              }
            });
          }
        }
      })
      .catch(() => {});
    const supabase = createSupabaseBrowserClient();
    // Private channel: Realtime enforces RLS on `realtime.messages`, so only the
    // run's owner receives its node inputs and outputs. As a public topic, anyone
    // holding the anon key who knew a run UUID could stream them.
    const channel = supabase.channel(`run:${activeRunId}`, {
      config: { private: true },
    });
    channel.on(
      "broadcast",
      { event: "*" },
      ({ event, payload }: { event: string; payload: unknown }) => {
        const p = (payload || {}) as {
          node_id?: string | null;
          duration_ms?: number;
          payload?: Record<string, unknown>;
        };
        if (event === "node_started" && p.node_id) {
          setRunStates((s) => ({ ...s, [p.node_id!]: "running" }));
        } else if (event === "node_succeeded" && p.node_id) {
          setRunStates((s) => ({ ...s, [p.node_id!]: "succeeded" }));
          const out = (p.payload as Record<string, unknown> | undefined)?.output;
          if (out !== undefined) applyOutputToDisplayNode(p.node_id, out);
          if (typeof out === "string") applyAiOutputToParentChats(p.node_id, out);
        } else if (event === "node_failed" && p.node_id) {
          setRunStates((s) => ({ ...s, [p.node_id!]: "failed" }));
        } else if (event === "node_skipped" && p.node_id) {
          setRunStates((s) => ({ ...s, [p.node_id!]: "skipped" }));
        } else if (event === "run_succeeded") {
          setIsRunning(false);
          setSystemStatus("succeeded");
          setRunEnd(Date.now());
        } else if (event === "run_failed") {
          setIsRunning(false);
          setSystemStatus("failed");
          setRunEnd(Date.now());
        } else if (event === "run_cancelled") {
          setIsRunning(false);
          setSystemStatus("cancelled");
          setRunEnd(Date.now());
        }
        setRunEvents((events) => [
          ...events,
          {
            kind: event,
            node_id: p.node_id ?? null,
            payload: p.payload || (p as Record<string, unknown>),
            duration_ms: p.duration_ms ?? null,
          },
        ]);
      }
    );
    channel.subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [activeRunId, applyOutputToDisplayNode, applyAiOutputToParentChats]);

  // ---- Connect / Add node helpers -----------------------------------------
  const onConnect = useCallback(
    (params: Connection) => {
      const id = `e_${params.source}_${params.target}_${Math.random().toString(36).slice(2, 7)}`;
      setEdges((eds) => addEdge({ ...params, id, animated: true, type: "deletable" }, eds));
    },
    [setEdges]
  );

  const addNodeAt = useCallback(
    (type: NodeType, position: { x: number; y: number }) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `n_${Math.random().toString(36).slice(2, 10)}`;
      const baseData: Record<string, unknown> = { isFrontend };
      if (AI_TYPES.has(type)) {
        const map: Record<string, string> = {
          llm: "text",
          imagegen: "image",
          audiogen: "audio",
          fileparser: "file",
        };
        baseData.type = map[type] || "text";
        setIsFrontend(false);
      }
      if (TRIGGER_TYPES.has(type)) {
        baseData.onTrigger = onTriggerButton;
        baseData.flow_id = flowId;
      }
      setNodes((ns) => [...ns, { id, type, position, data: baseData }]);
    },
    [isFrontend, setNodes, onTriggerButton, flowId]
  );

  function addNode(type: NodeType) {
    // Click-to-add: drop near the visible canvas center, using
    // `screenToFlowPosition` so panned/zoomed canvases still get a sensible
    // anchor (not the absolute world origin).
    const rect = wrapperRef.current?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.left + rect.width / 2 - 200, y: rect.top + rect.height / 2 - 100 }
      : { x: 200, y: 200 };
    const position = rf.screenToFlowPosition(screen);
    addNodeAt(type, position);
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type =
        e.dataTransfer.getData(PALETTE_DRAG_MIME) ||
        e.dataTransfer.getData("text/plain");
      if (!type) return;
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type as NodeType, position);
    },
    [rf, addNodeAt]
  );

  // ---- Save / Run --------------------------------------------------------
  const buildGraphSnapshot = useCallback(
    (snapshotNodes: Node[], snapshotEdges: Edge[]) => ({
      nodes: snapshotNodes.map((n) => {
        const dataAll = { ...(n.data || {}) } as Record<string, unknown>;
        // Strip non-serializable closures + render-only flags before saving.
        delete dataAll.onTrigger;
        delete dataAll.isFrontend;
        // ``flow_id`` is injected at hydrate-time so the Webhook node can
        // look up its public URL; it shouldn't be persisted in the graph.
        if (n.type === "webhook_in" || n.type === "manual_in" || n.type === "schedule_in") {
          delete dataAll.flow_id;
        }
        return { id: n.id, type: n.type as NodeType, position: n.position, data: dataAll };
      }),
      edges: snapshotEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    }),
    []
  );

  async function saveVersion(): Promise<FlowVersion> {
    setSaving(true);
    try {
      const graph = buildGraphSnapshot(rf.getNodes(), rf.getEdges());
      const v = await apiPost<FlowVersion>(`/flows/${flowId}/versions`, {
        graph,
        inputs: version?.inputs || [],
        outputs: version?.outputs || [],
      });
      setVersion(v);
      return v;
    } finally {
      setSaving(false);
    }
  }

  async function runFlow(
    startIds?: string[],
    inputOverrides?: Record<string, unknown>
  ) {
    setIsRunning(true);
    setSystemStatus("running");
    setRunStates({});
    setRunEvents([]);
    setRunStart(Date.now());
    setRunEnd(null);
    setShowSidebar(true);
    if (!startIds || startIds.length === 0) setActiveTriggerId(null);
    const v = await saveVersion();
    const run = await apiPost<{ id: string }>(`/flows/${flowId}/runs`, {
      input: null,
      version_id: v.id,
      start_node_ids: startIds,
      input_overrides: inputOverrides,
    });
    setActiveRunId(run.id);
  }

  async function cancelRun() {
    if (!activeRunId) return;
    try {
      await apiPost(`/runs/${activeRunId}/cancel`);
    } catch {
      /* the broadcast watchdog will still flip state */
    }
  }

  /**
   * Resume the run starting from a specific node. We collect the previous
   * run's outputs for every direct parent of ``nodeId`` and pass them to
   * the API as ``input_overrides`` so the partial re-run sees the exact
   * same context the failed run did. This is key for the "fix one prompt
   * and resume" workflow — without it the resumed run would re-derive
   * inputs from the saved graph (or run the upstream nodes again, which
   * we don't want when the upstream is expensive).
   */
  const resumeFromNode = useCallback(
    (nodeId: string) => {
      setResumeMode(false);

      // Map every node_id to its most recent succeeded output from the
      // events we already have in state.
      const lastOutputByNode: Record<string, unknown> = {};
      runEvents.forEach((e) => {
        if (e.kind !== "node_succeeded" || !e.node_id) return;
        const out = (e.payload as Record<string, unknown> | undefined)?.output;
        if (out !== undefined) lastOutputByNode[e.node_id] = out;
      });

      // Pass overrides for every direct parent of the resume node — the
      // executor only consults overrides for *out-of-scope* parents (the
      // ones that won't run again), so this is safe to do unconditionally.
      const parentIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
      const overrides: Record<string, unknown> = {};
      for (const pid of parentIds) {
        if (pid in lastOutputByNode) {
          overrides[pid] = lastOutputByNode[pid];
        } else {
          const parentNode = rf.getNode(pid);
          if (parentNode && DISPLAY_TYPES.has(parentNode.type as NodeType)) {
            const val = (parentNode.data as Record<string, unknown>)?.value;
            if (val !== undefined) overrides[pid] = val;
          }
        }
      }

      void runFlow([nodeId], Object.keys(overrides).length ? overrides : undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runEvents, edges]
  );

  /**
   * Load a *past* run into the right RunSidebar. The sidebar already knows
   * how to render an array of events; we just have to fetch the persisted
   * events from the API and rebuild the per-node state map. Realtime stays
   * subscribed for the active run, so picking a past run that's already
   * terminal is a no-op for live updates.
   */
  async function selectPastRun(runId: string) {
    setActiveRunId(runId);
    setShowSidebar(true);
    try {
      const detail = await apiGet<{
        run: { status?: string; created_at?: string; ended_at?: string | null; error?: string | null };
        events: Array<{
          kind: string;
          node_id: string | null;
          payload: Record<string, unknown> | null;
          duration_ms?: number | null;
        }>;
      }>(`/runs/${runId}`);
      const events: SidebarEvent[] = (detail.events || []).map((e) => ({
        kind: e.kind,
        node_id: e.node_id,
        payload: (e.payload || {}) as Record<string, unknown>,
        duration_ms: e.duration_ms ?? null,
      }));
      setRunEvents(events);
      const states: Record<string, NodeRunState> = {};
      events.forEach((e) => {
        if (!e.node_id) return;
        if (e.kind === "node_started") states[e.node_id] = "running";
        else if (e.kind === "node_succeeded") states[e.node_id] = "succeeded";
        else if (e.kind === "node_failed") states[e.node_id] = "failed";
        else if (e.kind === "node_skipped") states[e.node_id] = "skipped";
      });
      setRunStates(states);
      setSystemStatus(
        (detail.run?.status as "succeeded" | "failed" | "cancelled" | "running") || "idle"
      );
      if (detail.run?.created_at) setRunStart(new Date(detail.run.created_at).getTime());
      setRunEnd(detail.run?.ended_at ? new Date(detail.run.ended_at).getTime() : null);
      // Backfill the canvas display nodes with whatever outputs this past run
      // produced so the user sees the past result, not stale values.
      events.forEach((e) => {
        if (e.kind !== "node_succeeded" || !e.node_id) return;
        const out = (e.payload as Record<string, unknown> | undefined)?.output;
        if (out !== undefined) applyOutputToDisplayNode(e.node_id, out);
      });
    } catch (err) {
      console.warn("Failed to load past run", runId, err);
    }
  }

  useEffect(() => {
    runFlowRef.current = runFlow;
  });

  async function renameFlow(name: string) {
    if (!flow) return;
    setFlow({ ...flow, name });
    try {
      await apiPatch(`/flows/${flow.id}`, { name });
    } catch {
      // Roll back on failure.
      apiGet<{ flow: Flow }>(`/flows/${flowId}`).then((r) => setFlow(r.flow)).catch(() => {});
    }
  }

  // ---- Topo order + scope dimming ----------------------------------------
  const topo = useTopoOrder(nodes, edges);
  const scope = useMemo(() => {
    if (!activeTriggerId) return null;
    return downstreamScope([activeTriggerId], edges);
  }, [activeTriggerId, edges]);

  const totalDuration = runStart != null && runEnd != null ? runEnd - runStart : null;

  return (
    <RunStateContext.Provider value={runStates}>
      <TopoOrderContext.Provider value={topo}>
        <ScopeContext.Provider value={scope}>
        <ResumeContext.Provider value={{ enabled: resumeMode, resumeFromNode }}>
          <div
            ref={wrapperRef}
            className={`h-screen w-screen relative ${isFrontend ? "editor--frontend" : "editor--backend"}`}
          >
            <EditorTopBar
              flowName={flow?.name || "Loading…"}
              onRenameFlow={renameFlow}
              isFrontend={isFrontend}
              toggleFrontend={() => setIsFrontend((v) => !v)}
              onRun={() => runFlow()}
              onStop={cancelRun}
              onToggleResume={() => setResumeMode((v) => !v)}
              resumeMode={resumeMode}
              canResume={
                !isRunning &&
                (systemStatus === "failed" ||
                  systemStatus === "cancelled" ||
                  systemStatus === "succeeded")
              }
              onSave={saveVersion}
              onAddButton={() => addNode("button")}
              onToggleRunHistory={() => setShowRunHistory((v) => !v)}
              showRunHistory={showRunHistory}
              isRunning={isRunning}
              saving={saving}
              systemStatus={systemStatus}
            />
            <div className="absolute z-10 left-5 top-20">
              <EditorPalette onAdd={addNode} />
            </div>
            {/* The "live" run sidebar only appears once a run has actually
                started; otherwise we'd render an empty "Waiting for events"
                panel that confuses users on a fresh editor open. */}
            {showSidebar && activeRunId && (
              <RunSidebar
                nodes={nodes}
                states={runStates}
                events={runEvents}
                totalDurationMs={totalDuration}
                onClose={() => {
                  setShowSidebar(false);
                  setActiveTriggerId(null);
                  setRunStates({});
                  setSystemStatus("idle");
                }}
                offsetRight={showRunHistory ? 320 + 16 : 0}
              />
            )}
            {showRunHistory && (
              <RunHistoryPanel
                flowId={flowId}
                activeRunId={activeRunId}
                onSelect={(rid) => {
                  void selectPastRun(rid);
                }}
                onClose={() => setShowRunHistory(false)}
              />
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes as never}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              fitViewOptions={{ padding: 0.2 }}
              fitView={nodes.length > 0}
              attributionPosition="bottom-left"
              style={{ backgroundColor: "var(--background)" }}
              nodesDraggable={!isRunning}
              nodesConnectable={!isRunning}
              panOnScroll={!isRunning}
              defaultEdgeOptions={{ type: "deletable", animated: true }}
            >
              <Background color="#CCCCCC" variant={BackgroundVariant.Dots} gap={25} size={2} />
              {nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="card-surface px-8 py-6 flex flex-col items-center gap-3">
                    <Ghost size={64} strokeWidth={1.3} className="text-[var(--font--light)]" />
                    <div className="inline-flex items-baseline font-semibold text-2xl leading-none">
                      <span className="text-[var(--primary)]">Floow</span>
                      <span>Forge</span>
                    </div>
                    <div className="text-sm text-[var(--muted-foreground)] max-w-[20em] text-center">
                      This canvas is empty. Use the + button on the left to add your first node.
                    </div>
                  </div>
                </div>
              )}
            </ReactFlow>
          </div>
        </ResumeContext.Provider>
        </ScopeContext.Provider>
      </TopoOrderContext.Provider>
    </RunStateContext.Provider>
  );
}
