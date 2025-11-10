"use client";

import { useEffect, useRef, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeFrame } from "../NodeFrame";
import { useTopoStep, useInScope } from "../order-context";


type EditorCanvasRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorCanvasLabel(record: EditorCanvasRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorCanvasRecords(records: EditorCanvasRecord[]): EditorCanvasRecord[] {
  return records.slice().sort((a, b) => readEditorCanvasLabel(a).localeCompare(readEditorCanvasLabel(b)));
}

/**
 * Floowbox-style Text Box. The textarea is **uncontrolled-ish**: we keep the
 * latest text in component-local state so React Flow's frequent re-renders
 * (driven by other nodes' state changes) don't snap the caret back to the
 * end. We sync external updates to ``data.value`` only when the textarea is
 * not focused, so a run that produces a new value never overwrites the user
 * mid-edit.
 *
 * Persistence to ``data.value`` happens on every change (so saves capture
 * the latest text) and again on blur (defensive flush).
 */
export default function TextNode({ id, data, isConnectable }: NodeProps) {
  const { isFrontend = true, value = "" } = data as { isFrontend?: boolean; value?: string };
  const rf = useReactFlow();
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  const [localValue, setLocalValue] = useState<string>(typeof value === "string" ? value : "");
  const isFocusedRef = useRef(false);

  // Mirror external updates (run output, save reload) into local state only
  // when the user is not actively typing.
  useEffect(() => {
    if (typeof value === "string" && !isFocusedRef.current && value !== localValue) {
      setLocalValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function persist(next: string) {
    if (next !== value) {
      rf.updateNodeData(id, { value: next });
    }
  }

  return (
    <NodeFrame
      id={id}
      type="text"
      isConnectable={isConnectable}
      hidden={isFrontend}
      defaultName="Text Box"
      data={data as Record<string, unknown>}
      showWaitChip
      topoStep={step}
      className={inScope ? "scope-active" : "scope-dimmed"}
      cardClassName="w-[36em]"
    >
      <textarea
        className="w-full h-[200px] p-3 text-sm rounded-[14px] resize-none focus:outline-none bg-[var(--surface-2)] nodrag nopan overflow-y-auto"
        placeholder="Start typing here…"
        value={localValue}
        onChange={(e) => {
          const next = e.target.value;
          setLocalValue(next);
          persist(next);
        }}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          persist(localValue);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        readOnly={!isFrontend}
      />
    </NodeFrame>
  );
}

function buildEditorSelectionSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorSelectionRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorSelectionSearchText(record).includes(needle));
}

