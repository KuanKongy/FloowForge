"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BotMessageSquare,
  Check,
  ImageIcon,
  Loader2,
  Palette,
  Type,
  Webhook,
} from "lucide-react";

/**
 * A miniature FloowForge canvas that assembles itself and then plays a run.
 *
 * Deliberately built from the same design tokens as the editor (tinted node
 * tiles, topo step badges, per-node status chips) so the landing page shows the
 * actual product rather than a stylised impression of it.
 */

type Tone = "text" | "image" | "audio" | "file";

type DemoNode = {
  id: string;
  label: string;
  kind: string;
  tone: Tone;
  icon: React.ReactNode;
  /** Percentage position inside the canvas box. */
  x: number;
  y: number;
  /** Topological step — drives the badge and the run order. */
  step: number;
};

const NODES: DemoNode[] = [
  {
    id: "trigger",
    label: "Webhook In",
    kind: "Trigger",
    tone: "audio",
    icon: <Webhook size={18} />,
    x: 2,
    y: 34,
    step: 1,
  },
  {
    id: "prompt",
    label: "Prompt",
    kind: "Text Box",
    tone: "text",
    icon: <Type size={18} />,
    x: 27,
    y: 34,
    step: 2,
  },
  {
    id: "writer",
    label: "Copywriter",
    kind: "Text AI",
    tone: "text",
    icon: <BotMessageSquare size={18} />,
    x: 54,
    y: 9,
    step: 3,
  },
  {
    id: "artist",
    label: "Cover art",
    kind: "Image AI",
    tone: "image",
    icon: <Palette size={18} />,
    x: 54,
    y: 62,
    step: 3,
  },
  {
    id: "result",
    label: "Result",
    kind: "Image Box",
    tone: "image",
    icon: <ImageIcon size={18} />,
    x: 80,
    y: 34,
    step: 4,
  },
];

const EDGES: Array<[string, string]> = [
  ["trigger", "prompt"],
  ["prompt", "writer"],
  ["prompt", "artist"],
  ["writer", "result"],
  ["artist", "result"],
];

type NodeState = "idle" | "running" | "succeeded";

// The graph is authored at this size and uniformly scaled to whatever space it
// is given, so the layout is identical on a phone and a desktop.
const DESIGN_WIDTH = 900;
const DESIGN_HEIGHT = 450;
const NODE_WIDTH = 150;

/** Node ids grouped by the step they execute in. */
const STEPS = Array.from(new Set(NODES.map((n) => n.step))).sort((a, b) => a - b);

export function FlowDemo({
  autoPlay = true,
  running: externalRunning,
  onRunComplete,
  className = "",
}: {
  autoPlay?: boolean;
  /** Drive the run externally (used by the interactive section). */
  running?: boolean;
  onRunComplete?: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [assembled, setAssembled] = useState(false);
  const [states, setStates] = useState<Record<string, NodeState>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /** Walk the graph one topological step at a time. */
  const playRun = useCallback(() => {
    setStates({});
    let t = 250;
    STEPS.forEach((step) => {
      const ids = NODES.filter((n) => n.step === step).map((n) => n.id);
      schedule(() => {
        setStates((s) => {
          const next = { ...s };
          ids.forEach((id) => (next[id] = "running"));
          return next;
        });
      }, t);
      t += 620;
      schedule(() => {
        setStates((s) => {
          const next = { ...s };
          ids.forEach((id) => (next[id] = "succeeded"));
          return next;
        });
      }, t);
      t += 180;
    });
    schedule(() => onRunComplete?.(), t + 200);
    return t;
  }, [schedule, onRunComplete]);

  // Assemble once, then loop the run while autoPlay is on.
  useEffect(() => {
    if (reduceMotion) {
      setAssembled(true);
      setStates(Object.fromEntries(NODES.map((n) => [n.id, "succeeded"])));
      return;
    }
    const assembleMs = NODES.length * 130 + 500;
    schedule(() => setAssembled(true), assembleMs);
    return clearTimers;
  }, [reduceMotion, schedule, clearTimers]);

  useEffect(() => {
    if (!assembled || !autoPlay || reduceMotion) return;
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      const total = playRun();
      timers.current.push(setTimeout(loop, total + 2600));
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [assembled, autoPlay, reduceMotion, playRun]);

  // Externally driven run (the "try it" section).
  useEffect(() => {
    if (externalRunning === undefined) return;
    if (externalRunning) {
      clearTimers();
      setAssembled(true);
      playRun();
    }
  }, [externalRunning, playRun, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // Edge endpoints are measured from the rendered cards rather than guessed
  // from percentages: the card's height is a fixed pixel size, so any
  // percentage estimate drifts as the container resizes.
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [anchors, setAnchors] = useState<Record<string, { left: number; right: number; y: number }>>({});
  const [scale, setScale] = useState(1);

  // The graph is laid out at a fixed design size and scaled to fit. Letting it
  // reflow instead would collapse the node cards (they have a pixel min-width)
  // and push the right-hand nodes outside the canvas on narrow screens.
  useLayoutEffect(() => {
    const fit = () => {
      const width = outerRef.current?.clientWidth ?? DESIGN_WIDTH;
      // Capped above 1 so the cards don't balloon on very wide screens.
      setScale(Math.min(1.25, width / DESIGN_WIDTH));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (outerRef.current) observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const next: Record<string, { left: number; right: number; y: number }> = {};
      for (const node of NODES) {
        const el = nodeRefs.current[node.id];
        if (!el) continue;
        // `offsetLeft`/`offsetTop` are layout positions relative to the
        // positioned container and, unlike getBoundingClientRect, ignore the
        // scale/translate framer-motion applies during the entrance animation.
        next[node.id] = {
          left: el.offsetLeft,
          right: el.offsetLeft + el.offsetWidth,
          y: el.offsetTop + el.offsetHeight / 2,
        };
      }
      setAnchors((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([id, v]) => {
            const p = prev[id];
            return p && p.left === v.left && p.right === v.right && p.y === v.y;
          });
        return same ? prev : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className={`relative w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] dotted-grid-bg ${className}`}
      style={{ height: DESIGN_HEIGHT * scale }}
      aria-label="Animated preview of a FloowForge workflow running"
      role="img"
    >
      <div
        ref={containerRef}
        className="absolute top-0 left-0"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {EDGES.map(([from, to], i) => {
          const a = anchors[from];
          const b = anchors[to];
          if (!a || !b) return null;
          const x1 = a.right;
          const y1 = a.y;
          const x2 = b.left;
          const y2 = b.y;
          const active = states[from] === "succeeded";
          // Horizontal bezier, same shape React Flow draws in the editor.
          const dx = Math.max(28, (x2 - x1) * 0.55);
          const d = `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
          return (
            <motion.path
              key={`${from}-${to}`}
              d={d}
              fill="none"
              stroke={active ? "var(--primary)" : "var(--font--light)"}
              strokeWidth={active ? 2 : 1.5}
              strokeLinecap="round"
              // Deliberately not framer-motion's `pathLength`: it rewrites
              // strokeDasharray in normalised units and, without a matching
              // `pathLength="1"` attribute, leaves the edge as a 1px hairline
              // dotted line that is invisible against the canvas.
              strokeDasharray="6 6"
              className={active ? "flow-demo-edge--active" : undefined}
              initial={reduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.3 + i * 0.08, duration: 0.45 }}
            />
          );
        })}
      </svg>

      {NODES.map((node, i) => (
        <motion.div
          key={node.id}
          ref={(el) => {
            nodeRefs.current[node.id] = el;
          }}
          className="absolute"
          style={{ left: `${node.x}%`, top: `${node.y}%`, width: NODE_WIDTH }}
          initial={reduceMotion ? undefined : { opacity: 0, y: 14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: reduceMotion ? 0 : i * 0.13, type: "spring", stiffness: 260, damping: 22 }}
        >
          <DemoNodeCard node={node} state={states[node.id] ?? "idle"} />
        </motion.div>
      ))}
      </div>
    </div>
  );
}

function DemoNodeCard({ node, state }: { node: DemoNode; state: NodeState }) {
  const border =
    state === "running"
      ? "var(--primary)"
      : state === "succeeded"
        ? "rgba(var(--image__font-rgb), 0.5)"
        : "var(--border)";

  return (
    <div
      className="relative rounded-[12px] bg-[var(--surface-2)] px-2.5 py-2 flex items-center gap-2 transition-[border-color,box-shadow] duration-300"
      style={{
        border: `1px solid ${border}`,
        boxShadow:
          state === "running"
            ? "0 0 0 3px rgba(var(--primary-rgb), 0.12), 0 4px 14px rgba(201,201,209,0.3)"
            : "0 3px 10px rgba(201, 201, 209, 0.18)",
      }}
    >
      <div
        className="rounded-[8px] p-1.5 shrink-0 flex items-center justify-center"
        style={{
          backgroundColor: `rgba(var(--${node.tone}__background-rgb), 1)`,
          color: `rgba(var(--${node.tone}__font-rgb), 1)`,
        }}
      >
        {node.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold truncate leading-tight">{node.label}</div>
        <div className="text-[9px] text-[var(--muted-foreground)] truncate">{node.kind}</div>
      </div>

      {/* Topological step badge — the same affordance the editor shows. */}
      <span
        className="absolute -top-2 -left-2 size-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted-foreground)]"
        aria-hidden="true"
      >
        {node.step}
      </span>

      {state !== "idle" && (
        <span className="absolute -top-2 -right-2 size-[18px] rounded-full flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)]">
          {state === "running" ? (
            <Loader2 size={11} className="animate-spin text-[var(--primary)]" />
          ) : (
            <Check size={11} className="text-[var(--image__font)]" />
          )}
        </span>
      )}
    </div>
  );
}
