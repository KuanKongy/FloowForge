"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronDown, Maximize2, Minimize2, PencilLine } from "lucide-react";
import { useNodeRunState, runStateClass } from "./run-state-context";
import { NodeHandleWrapper } from "./NodeHandleWrapper";
import { ResumeOverlay } from "./ResumeOverlay";

export type WaitStrategy = "barrier" | "race";

/**
 * `headerVariant` controls how the rename + collapse + wait controls are
 * positioned around the card:
 *
 * - `"top"`   - default. Top header strip with rename / collapse, plus the
 *               absolute wait-chip in the top-right corner. Used by
 *               Text/Image/Audio/File/Chat box nodes.
 * - `"none"`  - no automatic header / wait-chip / topo badge controls. The
 *               node body is responsible for rendering rename + wait chip via
 *               {@link useNodeFrameControls}. Used by AI Model so the rename
 *               input lives next to the bold model name (Floowbox layout)
 *               and by Button/Trigger nodes which don't need any controls.
 */
export type HeaderVariant = "top" | "none";

export function NodeFrame({
  id,
  type,
  isConnectable,
  hidden,
  defaultName,
  data,
  showWaitChip = false,
  collapsible = false,
  topoStep,
  className = "",
  cardClassName = "",
  headerVariant = "top",
  children,
}: {
  id: string;
  type: string;
  isConnectable: boolean;
  hidden: boolean;
  defaultName: string;
  data: Record<string, unknown>;
  showWaitChip?: boolean;
  collapsible?: boolean;
  topoStep?: number;
  className?: string;
  /** Extra classes applied to the inner card. */
  cardClassName?: string;
  headerVariant?: HeaderVariant;
  children: ReactNode;
}) {
  const state = useNodeRunState(id);
  const ctrl = useNodeFrameControls(id, {
    defaultName,
    data,
    collapsible,
  });

  return (
    <div className={`relative ${runStateClass(state)} ${className}`}>
      <NodeHandleWrapper id={id} type={type} isConnectable={isConnectable} hidden={hidden}>
        <div className={`node-frame__card ${cardClassName}`}>
          {headerVariant === "top" && (
            <header className="node-frame__header group">
              {ctrl.renderRename({
                wrapperClassName: "flex items-center gap-1",
                staticClassName:
                  "text-xs font-medium text-[var(--muted-foreground)] cursor-text select-none",
                inputClassName:
                  "nodrag nopan text-xs font-medium bg-transparent border-b border-[var(--primary)] outline-none",
                showPencil: true,
              })}
              <span className="ml-auto" />
              {collapsible && ctrl.renderCollapseButton()}
            </header>
          )}
          {ctrl.collapsed ? (
            <div
              className="node-frame__collapsed-body"
              onClick={ctrl.toggleCollapsed}
              title="Click to expand"
            >
              <ChevronDown size={14} className="text-[var(--muted-foreground)]" />
              <span className="font-medium text-sm">{ctrl.name}</span>
            </div>
          ) : (
            <div className="node-frame__body">{children}</div>
          )}
          {topoStep !== undefined && (
            <span className="topo-badge" aria-label={`Step ${topoStep}`}>
              {topoStep}
            </span>
          )}
          {headerVariant === "top" && showWaitChip && ctrl.renderWaitChip("top")}
          <ResumeOverlay nodeId={id} />
        </div>
      </NodeHandleWrapper>
    </div>
  );
}

type RenameRenderOpts = {
  wrapperClassName?: string;
  staticClassName?: string;
  inputClassName?: string;
  showPencil?: boolean;
  /**
   * Called when the user manually accepts a name. The body can use this to,
   * for example, *not* persist a fallback / auto-tracked value.
   */
  onCommit?: (next: string) => void;
};

/**
 * Hook that exposes the rename, wait-chip, and collapse controls so a node
 * body can render them inline (Floowbox-style) instead of in the top header
 * strip. This is what powers AI Model's "name + barrier/race on the same
 * row as the chosen model" layout.
 */
export function useNodeFrameControls(
  id: string,
  {
    defaultName,
    data,
    collapsible = false,
  }: {
    defaultName: string;
    data: Record<string, unknown>;
    collapsible?: boolean;
  }
) {
  const rf = useReactFlow();
  const collapsed = collapsible && data.collapsed === true;
  const storedName = (data.name as string) || "";
  const name = storedName || defaultName;
  const strategy: WaitStrategy = (data.wait_strategy as WaitStrategy) || "barrier";

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  useEffect(() => {
    if (!editingName) setDraftName(name);
  }, [name, editingName]);

  function commitName(opts?: RenameRenderOpts) {
    const next = draftName.trim();
    setEditingName(false);
    if (next && next !== name) {
      rf.updateNodeData(id, { name: next });
      opts?.onCommit?.(next);
    } else {
      setDraftName(name);
    }
  }

  function toggleCollapsed() {
    if (!collapsible) return;
    rf.updateNodeData(id, { collapsed: !collapsed });
  }

  function cycleStrategy() {
    rf.updateNodeData(id, { wait_strategy: strategy === "barrier" ? "race" : "barrier" });
  }

  function renderRename(opts: RenameRenderOpts = {}) {
    const wrapper = opts.wrapperClassName ?? "flex items-center gap-1 group";
    const staticCls =
      opts.staticClassName ??
      "text-sm font-semibold cursor-text select-none";
    const inputCls =
      opts.inputClassName ??
      "nodrag nopan text-sm font-semibold bg-transparent border-b border-[var(--primary)] outline-none";
    return (
      <span className={wrapper}>
        {editingName ? (
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => commitName(opts)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName(opts);
              if (e.key === "Escape") {
                setDraftName(name);
                setEditingName(false);
              }
            }}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
            className={inputCls}
            aria-label="Node name"
          />
        ) : (
          <span
            className={staticCls}
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}
        {opts.showPencil !== false && (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="node-frame__icon-btn opacity-0 group-hover:opacity-100"
            aria-label="Rename node"
            title="Rename"
          >
            <PencilLine size={11} />
          </button>
        )}
      </span>
    );
  }

  function renderCollapseButton() {
    if (!collapsible) return null;
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="node-frame__icon-btn"
        aria-label={collapsed ? "Expand node" : "Collapse node"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
      </button>
    );
  }

  /**
   * @param mode `"top"` keeps the absolute top-right corner placement (used
   * inside the auto header strip). `"inline"` removes the absolute positioning
   * so callers can place the chip in any flexbox row (used by AI Model).
   */
  function renderWaitChip(mode: "top" | "inline" = "top", extraClassName = "") {
    const layout = mode === "top" ? "wait-chip" : "wait-chip wait-chip--inline";
    return (
      <button
        type="button"
        className={`${layout} nodrag nopan ${extraClassName}`}
        data-strategy={strategy}
        onClick={cycleStrategy}
        onMouseDown={(e) => e.stopPropagation()}
        title={
          strategy === "barrier"
            ? "Wait: Barrier (all parents must finish)"
            : "Wait: Race (any parent triggers)"
        }
        aria-label="Toggle wait strategy"
      >
        {strategy === "barrier" ? "Barrier" : "Race"}
      </button>
    );
  }

  return {
    name,
    storedName,
    strategy,
    collapsed,
    editing: editingName,
    startEditing: () => setEditingName(true),
    toggleCollapsed,
    cycleStrategy,
    renderRename,
    renderCollapseButton,
    renderWaitChip,
  };
}
