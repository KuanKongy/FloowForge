"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";

interface Message {
  content: string;
  role: string;
}

export default function ChatNode({ id, data, isConnectable }: NodeProps) {
  const {
    isFrontend = true,
    messages = [],
    onTrigger,
  } = data as {
    isFrontend?: boolean;
    messages?: Message[];
    onTrigger?: (id: string) => void;
  };
  const rf = useReactFlow();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!draft.trim()) return;
    const next = [...messages, { content: draft, role: "user" }];
    rf.updateNodeData(id, { messages: next });
    setDraft("");
    onTrigger?.(id);
  }

  return (
    <NodeFrame
      id={id}
      type="chat"
      isConnectable={isConnectable}
      hidden={isFrontend}
      defaultName="Chat Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[40em]"
    >
      <div className="h-[520px] flex flex-col">
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
                className={`p-3 rounded-[12px] max-w-[80%] ${
                  m.role === "user"
                    ? "self-end bg-[var(--secondary)] text-[var(--primary)]"
                    : "self-start bg-[var(--muted)]"
                }`}
              >
                {m.content}
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
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            className="flex-1 h-9 px-3 rounded-full border border-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 nodrag nopan"
            readOnly={!isFrontend}
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
