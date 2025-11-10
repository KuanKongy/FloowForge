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

export const PALETTE_DRAG_MIME = "application/flowforge-node";

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
