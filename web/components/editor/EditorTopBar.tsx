"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CodeXml,
  History,
  House,
  Loader2,
  MoveLeft,
  PencilLine,
  Play,
  RotateCw,
  Save,
  Square,
  X,
  Zap,
} from "lucide-react";

/**
 * Floating top bar — left pill (home, name, frontend toggle, status) and a
 * right pill (Save, Add Button, Run / Stop / Resume). Below the right pill
 * sits a small History button for opening the run history panel. Visual
 * style matches Floowbox's `TopMenu`.
 */
export function EditorTopBar({
  flowName,
  onRenameFlow,
  isFrontend,
  toggleFrontend,
  onRun,
  onStop,
  onToggleResume,
  resumeMode = false,
  onSave,
  onAddButton,
  onToggleRunHistory,
  showRunHistory = false,
  isRunning,
  canResume = false,
  saving,
  systemStatus = "idle",
}: {
  flowName: string;
  onRenameFlow: (name: string) => void;
  isFrontend: boolean;
  toggleFrontend: () => void;
  onRun: () => void;
  onStop?: () => void;
  /** Toggle "resume mode" — every non-trigger node renders a Play overlay
   *  so the user can pick which node to start from. */
  onToggleResume?: () => void;
  resumeMode?: boolean;
  onSave: () => void;
  onAddButton: () => void;
  onToggleRunHistory?: () => void;
  showRunHistory?: boolean;
  isRunning: boolean;
  canResume?: boolean;
  saving: boolean;
  systemStatus?: "idle" | "running" | "succeeded" | "failed" | "cancelled";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(flowName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(flowName);
  }, [flowName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== flowName) onRenameFlow(next);
    else setDraft(flowName);
  }

  return (
    <div className="pointer-events-none absolute z-10 inset-x-0 top-0 px-5 py-4 flex items-start justify-between gap-4">
      {/* LEFT pill: home, name, toggle, status */}
      <div className="floating-menu pointer-events-auto items-center px-2 gap-2">
        <Link
          href="/app/flows"
          className="size-9 rounded-full hover:bg-[var(--secondary)] flex items-center justify-center transition-colors"
          aria-label="Back to flow list"
        >
          <House size={18} />
        </Link>
        <div className="group flex items-center gap-1 px-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(flowName);
                  setEditing(false);
                }
              }}
              className="font-medium text-sm w-[14em] bg-transparent border-b border-[var(--primary)] outline-none"
            />
          ) : (
            <>
              <span className="font-medium text-sm">{flowName}</span>
              <button
                onClick={() => setEditing(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                aria-label="Rename flow"
                title="Rename flow"
              >
                <PencilLine size={14} />
              </button>
            </>
          )}
        </div>
        <div
          onClick={toggleFrontend}
          className="cursor-pointer w-12 h-7 rounded-full bg-[var(--primary-grey)] p-[2px] flex items-center hover:brightness-95 transition-[filter]"
          style={{ justifyContent: isFrontend ? "flex-start" : "flex-end" }}
          role="switch"
          aria-checked={isFrontend}
          aria-label="Toggle frontend / backend mode"
        >
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 700, damping: 30 }}
            className="size-6 rounded-full bg-white border border-[var(--border)] flex items-center justify-center"
          >
            <CodeXml size={14} className="text-[var(--muted-foreground)]" />
          </motion.div>
        </div>
        <span
          className="pill"
          style={{
            backgroundColor: isFrontend ? "var(--secondary)" : "rgba(229,238,255,1)",
            color: isFrontend ? "var(--primary)" : "var(--audio__font)",
          }}
        >
          {isFrontend ? "Frontend" : "Backend"}
        </span>
        <SystemStatus status={systemStatus} />
      </div>

      {/* RIGHT side: a single pill containing Save / Add / Run / History so
          all primary actions stay on the same horizontal level. */}
      <div className="flex flex-col items-end gap-3">
        <div className="floating-menu pointer-events-auto items-center">
          <button
            onClick={onSave}
            disabled={saving}
            className="floating-menu__button h-9 px-4 rounded-full flex items-center gap-2 text-sm hover:bg-[var(--secondary)] transition-colors"
            aria-label="Save flow"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving" : "Save"}
          </button>
          <button
            onClick={onAddButton}
            className="floating-menu__button h-9 px-3 rounded-full flex items-center gap-2 text-sm hover:bg-[var(--secondary)] transition-colors"
            aria-label="Add a Button trigger"
            title="Add a Button trigger"
          >
            <Zap size={14} />
            Add Button
          </button>
          {isRunning ? (
            <button
              onClick={onStop}
              className="floating-menu__button floating-menu__button--puff h-9 px-4 rounded-full flex items-center gap-2 text-sm font-semibold text-[var(--primary)] border-[var(--primary)]"
              aria-label="Stop run"
              title="Stop"
            >
              <Square size={14} fill="currentColor" />
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={onRun}
                className="floating-menu__button floating-menu__button--outlined floating-menu__button--filled floating-menu__button--puff h-9 px-4 rounded-full flex items-center gap-2 text-sm font-semibold"
                aria-label="Run flow"
                title="Run"
              >
                <Play size={14} />
                Run
              </button>
              {canResume && onToggleResume && (
                <button
                  onClick={onToggleResume}
                  aria-pressed={resumeMode}
                  className={`floating-menu__button h-9 px-3 rounded-full flex items-center gap-2 text-sm transition-colors ${
                    resumeMode
                      ? "bg-[var(--secondary)] text-[var(--primary)] border-[var(--primary)]"
                      : "hover:bg-[var(--secondary)]"
                  }`}
                  aria-label={resumeMode ? "Cancel resume" : "Resume from a specific node"}
                  title={
                    resumeMode
                      ? "Click again to cancel"
                      : "Click, then pick a node to start the run from there"
                  }
                >
                  <RotateCw size={14} />
                  {resumeMode ? "Pick a node" : "Resume"}
                </button>
              )}
            </>
          )}
          {onToggleRunHistory && (
            <button
              onClick={onToggleRunHistory}
              aria-pressed={showRunHistory}
              aria-label={showRunHistory ? "Hide run history" : "Show run history"}
              title={showRunHistory ? "Hide runs" : "Show runs"}
              className={`history-btn group size-9 rounded-full flex items-center justify-center transition-colors ${
                showRunHistory ? "bg-[var(--secondary)] text-[var(--primary)]" : ""
              }`}
            >
              {/* X when open or on hover (clicking closes), History otherwise. */}
              {showRunHistory ? (
                <X size={16} />
              ) : (
                <>
                  <History size={16} className="group-hover:hidden" />
                  <X size={16} className="hidden group-hover:inline-block" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemStatus({ status }: { status: "idle" | "running" | "succeeded" | "failed" | "cancelled" }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    idle: { label: "Ready", bg: "var(--muted)", color: "var(--muted-foreground)" },
    running: {
      label: "Running",
      bg: "rgba(var(--audio__background-rgb), 0.7)",
      color: "var(--audio__font)",
    },
    succeeded: {
      label: "Succeeded",
      bg: "rgba(var(--image__background-rgb), 0.7)",
      color: "var(--image__font)",
    },
    failed: { label: "Failed", bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
    cancelled: { label: "Cancelled", bg: "var(--muted)", color: "var(--muted-foreground)" },
  };
  const meta = map[status] || map.idle;
  return (
    <span
      className="pill ml-1"
      style={{ backgroundColor: meta.bg, color: meta.color }}
      aria-label={`System status: ${meta.label}`}
    >
      <span aria-hidden className="inline-block size-1.5 rounded-full bg-current align-middle mr-1.5" />
      {meta.label}
    </span>
  );
}

export { ArrowLeft, MoveLeft }; // re-export for any callers using these icons
