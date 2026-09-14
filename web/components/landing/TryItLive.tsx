"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BotMessageSquare, CheckCircle2, Palette, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowDemo } from "./FlowDemo";

const PRESETS = [
  "a launch post for a solar-powered backpack",
  "a changelog entry for dark mode shipping",
  "a welcome email for new beta testers",
];

/**
 * A hands-on version of the hero canvas: the visitor types a prompt, presses
 * Run, and watches the same graph execute step by step.
 *
 * The "output" mirrors what the Result node actually receives — one artifact
 * per AI branch, named for the prompt that produced it — rather than prose
 * about the graph. The footnote says the whole thing is simulated.
 */
export function TryItLive() {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [running, setRunning] = useState(false);
  // The prompt as it was when the finished run started; null = no result yet.
  const [ranPrompt, setRanPrompt] = useState<string | null>(null);

  function run() {
    if (running) return;
    setRanPrompt(null);
    setRunning(true);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-5 items-stretch">
      <FlowDemo
        autoPlay={false}
        fillHeight
        running={running}
        onRunComplete={() => {
          setRunning(false);
          setRanPrompt(prompt.trim() || "your prompt");
        }}
      />

      <div className="card-surface p-5 flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-[0.95rem] flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--primary)]" />
            Try the canvas
          </h3>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Type a prompt and press Run to watch the graph execute, step by step.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm resize-none focus:outline-none focus:border-[var(--primary)] transition-colors"
            placeholder="Describe what you want to make…"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPrompt(p)}
              className="pill border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors text-left"
            >
              {p.split(" ").slice(0, 3).join(" ")}…
            </button>
          ))}
        </div>

        <Button onClick={run} disabled={running} className="w-full justify-center">
          <Play size={15} /> {running ? "Running…" : "Run workflow"}
        </Button>

        <AnimatePresence mode="wait">
          {ranPrompt && (
            <motion.div
              key="out"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                  Result node output
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--image__font)]">
                  <CheckCircle2 size={12} /> Run finished
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                <li className="flex items-center gap-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-2">
                  <span
                    className="rounded-[7px] p-1.5 shrink-0"
                    style={{
                      backgroundColor: "rgba(var(--text__background-rgb), 1)",
                      color: "rgba(var(--text__font-rgb), 1)",
                    }}
                  >
                    <BotMessageSquare size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">copy.md</span>
                    <span className="block text-[11px] text-[var(--muted-foreground)] truncate">
                      Draft copy for &ldquo;{ranPrompt}&rdquo;
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">
                    Text AI
                  </span>
                </li>
                <li className="flex items-center gap-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-2">
                  <span
                    className="rounded-[7px] p-1.5 shrink-0"
                    style={{
                      backgroundColor: "rgba(var(--image__background-rgb), 1)",
                      color: "rgba(var(--image__font-rgb), 1)",
                    }}
                  >
                    <Palette size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">cover.png</span>
                    <span className="block text-[11px] text-[var(--muted-foreground)] truncate">
                      Matching cover illustration
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">
                    Image AI
                  </span>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3 mt-auto">
          This preview is simulated in your browser.
        </p>
      </div>
    </div>
  );
}
