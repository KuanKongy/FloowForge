"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
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
 * The output is generated locally from their input — no account, no API call,
 * no spend. The panel says so explicitly rather than implying a live model.
 */
export function TryItLive() {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  function run() {
    if (running) return;
    setOutput(null);
    setRunning(true);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-5 items-start">
      <FlowDemo
        autoPlay={false}
        running={running}
        onRunComplete={() => {
          setRunning(false);
          setOutput(
            `Draft copy for “${prompt.trim() || "your prompt"}”, plus a matching cover image — produced by the two AI nodes running in parallel, then joined at the Result node.`
          );
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
          {output && (
            <motion.div
              key="out"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-3"
            >
              <div className="text-[11px] font-medium text-[var(--muted-foreground)] mb-1">
                Result node output
              </div>
              <p className="text-sm">{output}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
          This preview is simulated in your browser — no account and no model
          calls. In the real editor these nodes call OpenAI, Gemini, Cloudflare
          Workers AI, or DeepSeek.
        </p>
      </div>
    </div>
  );
}
