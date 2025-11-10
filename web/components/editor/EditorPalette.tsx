"use client";

import { useState } from "react";
import {
  AudioLines,
  BookOpen,
  BotMessageSquare,
  ChevronUp,
  FileAudio,
  Heading,
  Image as ImageIcon,
  MessagesSquare,
  Palette,
  Plus,
  Share2,
  Sparkles,
  Type,
  Upload,
  Webhook,
  Zap,
} from "lucide-react";
import { type NodeType } from "@flowforge/shared";

/**
 * Palette is a direct port of Floowbox's `ComponentMenu` (see
 * /Users/saikou/Documents/Projects/ReactProjects/Floowbox/frontend/app/custom-flow/ComponentMenu.tsx):
 * a vertical, 3.5em-wide white column with sections separated by light dividers.
 *
 * Every entry is a 2.5em square button with a thin pink border and a
 * primary-color glyph; on hover the background flips to a soft pink and a
 * tooltip pill fades in to the right of the button. Buttons are draggable so
 * users can either click to add a node at the viewport center or drag onto
 * the canvas to drop at the cursor.
 */

type Item = {
  icon: React.ReactNode;
  label: string;
  type: NodeType;
};

type Section = { items: Item[] };


function buildEditorHandleSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterEditorHandleRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildEditorHandleSearchText(record).includes(needle));
}

const SECTIONS: Section[] = [
  {
    items: [
      { icon: <Type size={22} strokeWidth={1.65} />, label: "Text Box", type: "textbox" },
      { icon: <ImageIcon size={22} strokeWidth={1.65} />, label: "Image Box", type: "imagebox" },
      { icon: <AudioLines size={22} strokeWidth={1.65} />, label: "Audio Box", type: "audiobox" },
      { icon: <Heading size={22} strokeWidth={1.65} />, label: "Header", type: "header" },
      { icon: <Upload size={22} strokeWidth={1.65} />, label: "File Box", type: "filebox" },
      { icon: <MessagesSquare size={22} strokeWidth={1.65} />, label: "Chat Box", type: "chatbox" },
    ],
  },
  {
    items: [
      { icon: <BotMessageSquare size={22} strokeWidth={1.65} />, label: "Text AI", type: "llm" },
      { icon: <Palette size={22} strokeWidth={1.65} />, label: "Image AI", type: "imagegen" },
      { icon: <FileAudio size={22} strokeWidth={1.65} />, label: "Audio AI", type: "audiogen" },
      { icon: <BookOpen size={22} strokeWidth={1.65} />, label: "File Parser", type: "fileparser" },
    ],
  },
  {
    items: [
      { icon: <Zap size={22} strokeWidth={1.65} />, label: "Run Button", type: "button" },
      { icon: <Webhook size={22} strokeWidth={1.65} />, label: "Webhook In", type: "webhook_in" },
      { icon: <Plus size={22} strokeWidth={1.65} />, label: "Manual In", type: "manual_in" },
    ],
  },
  {
    items: [
      // Share2 (a forking-arrow icon) reads as "subflow" — distinct from
      // the Sparkles glyph used for AI-driven custom nodes.
      { icon: <Share2 size={22} strokeWidth={1.65} />, label: "Subflow", type: "subflow" },
      { icon: <Sparkles size={22} strokeWidth={1.65} />, label: "Custom Node", type: "prompt_template" },
    ],
  },
];


type EditorFrameRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readEditorFrameLabel(record: EditorFrameRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortEditorFrameRecords(records: EditorFrameRecord[]): EditorFrameRecord[] {
  return records.slice().sort((a, b) => readEditorFrameLabel(a).localeCompare(readEditorFrameLabel(b)));
}

export const PALETTE_DRAG_MIME = "application/flowforge-node";


const editorviewportTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveEditorViewportTone(status: string | undefined): keyof typeof editorviewportTone {
  if (status && status in editorviewportTone) return status as keyof typeof editorviewportTone;
  return 'queued';
}

export function EditorPalette({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const [expand, setExpand] = useState(false);

  function startDrag(e: React.DragEvent<HTMLButtonElement>, type: NodeType) {
    e.dataTransfer.setData(PALETTE_DRAG_MIME, type);
    e.dataTransfer.setData("text/plain", type);
    e.dataTransfer.effectAllowed = "move";
  }

  if (!expand) {
    return (
      <div className="top-menu__component-menu flex items-center justify-center">
        <button
          type="button"
          onClick={() => setExpand(true)}
          className="component-menu__button"
          aria-label="Open node palette"
        >
          <Plus size={22} strokeWidth={1.65} />
        </button>
      </div>
    );
  }

  return (
    <div className="top-menu__component-menu flex flex-col items-center justify-between py-[0.6em] gap-y-[0.5em]">
      <button
        type="button"
        onClick={() => setExpand(false)}
        className="component-menu__button--collapse"
        aria-label="Collapse palette"
      >
        <ChevronUp size={22} strokeWidth={1.65} />
      </button>
      {SECTIONS.map((section, i) => (
        <div key={i} className="component-menu__wrapper">
          {i > 0 && <div className="component-menu__divider" />}
          <div className="component-menu__section">
            {section.items.map((item) => (
              <TooltipButton
                key={item.type}
                tooltip={item.label}
                onClick={() => onAdd(item.type)}
                onDragStart={(e) => startDrag(e, item.type)}
              >
                {item.icon}
              </TooltipButton>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


function groupEditorMappingByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countEditorMappingByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function TooltipButton({
  tooltip,
  onClick,
  onDragStart,
  children,
}: {
  tooltip: string;
  onClick: () => void;
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group inline-block">
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className="component-menu__button--component"
        aria-label={tooltip}
      >
        {children}
      </button>
      <div className="palette-tooltip">{tooltip}</div>
    </div>
  );
}

function pickEditorSourceChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeEditorSourcePatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

