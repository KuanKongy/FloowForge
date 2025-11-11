"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame, useNodeFrameControls } from "../NodeFrame";
import { BackendBox } from "../BackendBox";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";

interface Message {
  content: string;
  role: string;
}

export default function ChatNode({ id, data, isConnectable }: NodeProps) {
  const {
    isFrontend = true,
    messages = [],
    memory_enabled,
    memory_mode,
    system_prompt = "",
  } = data as {
    isFrontend?: boolean;
    messages?: Message[];
    memory_enabled?: boolean;
    memory_mode?: "wipe" | "keep" | "update";
    system_prompt?: string;
  };
  const currentMemoryMode: "wipe" | "keep" | "update" =
    memory_mode || (memory_enabled === false ? "keep" : "update");
  const rf = useReactFlow();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const step = useTopoStep(id);
  const inScope = useInScope(id);
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, { defaultName: "Chat Box", data: data as Record<string, unknown> });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!draft.trim()) return;
    const next = [...messages, { content: draft, role: "user" }];
    rf.updateNodeData(id, { messages: next });
    setDraft("");
  }

  function update(patch: Record<string, unknown>) {
    rf.updateNodeData(id, patch);
  }

  if (!isFrontend) {
    return (
      <div className={`relative ${runStateClass(state)} ${inScope ? "scope-active" : "scope-dimmed"}`}>
        <NodeHandleWrapper id={id} type="chat" isConnectable={isConnectable} hidden={false}>
          <div className="backend-shell backend-shell--chat" style={{ width: "40em", height: "566px" }}>
            <BackendBox kind="chat" icon={<MessagesSquare size={20} strokeWidth={1.5} />} label={ctrl.name} />
          </div>
        </NodeHandleWrapper>
        {step !== undefined && <span className="topo-badge" aria-label={`Step ${step}`}>{step}</span>}
        {ctrl.renderWaitChip("top")}
        <ResumeOverlay nodeId={id} />
      </div>
    );
  }

  return (
    <NodeFrame
      id={id}
      type="chat"
      isConnectable={isConnectable}
      hidden={true}
      defaultName="Chat Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[40em]"
    >
      <div className="h-[520px] flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 text-xs">
          <input
            value={system_prompt}
            onChange={(e) => update({ system_prompt: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="System prompt"
            className="nodrag nopan h-8 flex-1 min-w-0 px-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-xs"
          />
          <select
            value={currentMemoryMode}
            onChange={(e) => update({ memory_mode: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nopan h-8 px-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--muted-foreground)]"
            aria-label="After run"
          >
            <option value="wipe">Wipe</option>
            <option value="keep">Keep</option>
            <option value="update">Update</option>
          </select>
          <button
            type="button"
            onClick={() => update({ messages: [] })}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nopan size-8 rounded-[8px] flex items-center justify-center hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
            aria-label="Reset conversation"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 flex flex-col gap-2 nowheel"
          onWheel={(e) => e.stopPropagation()}
        >
          {messages.length === 0 ? (
            <div className="text-sm text-[var(--muted-foreground)]">Conversation appears here.</div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`group relative p-3 pr-8 rounded-[12px] max-w-[80%] ${
                  m.role === "user"
                    ? "self-end bg-[var(--secondary)] text-[var(--primary)]"
                    : m.role === "system"
                    ? "self-center bg-[var(--surface-2)] text-[var(--muted-foreground)] border border-[var(--border)]"
                    : "self-start bg-[var(--muted)]"
                }`}
              >
                {m.role !== "user" && (
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
                    {m.role}
                  </div>
                )}
                {m.content}
                <button
                  type="button"
                  onClick={() => update({ messages: messages.filter((_, idx) => idx !== i) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted-foreground)] hover:text-red-500"
                  aria-label="Delete message"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-[var(--border)] flex gap-2 items-center">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            className="flex-1 h-9 px-3 rounded-full border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 nodrag nopan"
          />
          <button
            onClick={send}
            onMouseDown={(e) => e.stopPropagation()}
            className="size-9 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:opacity-90 transition-opacity nodrag nopan"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </NodeFrame>
  );
}
