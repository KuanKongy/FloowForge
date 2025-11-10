"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";


type EditorHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorHistoryLabel(record: EditorHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorHistoryRecords(records: EditorHistoryRecord[]): EditorHistoryRecord[] {
  return records.slice().sort((a, b) => readEditorHistoryLabel(a).localeCompare(readEditorHistoryLabel(b)));
}


function moveEditorStorageItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeEditorStorageItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}


function groupEditorStatusByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countEditorStatusByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

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

const editordetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveEditorDetailTone(status: string | undefined): keyof typeof editordetailTone {
  if (status && status in editordetailTone) return status as keyof typeof editordetailTone;
  return 'queued';
}


function buildEditorSearchSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorSearchRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorSearchSearchText(record).includes(needle));
}


function pickEditorPayloadChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeEditorPayloadPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

