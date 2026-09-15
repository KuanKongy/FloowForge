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
 * What the Result node would actually receive: the first lines of the drafted
 * copy and the generated cover, per preset. Custom prompts fall back to a
 * generic draft that reads like real copy rather than a description of copy.
 */
type MockOutput = {
  copy: string;
  coverGradient: string;
  coverEmoji: string;
};

const MOCK_OUTPUTS: Record<string, MockOutput> = {
  [PRESETS[0]]: {
    copy:
      "Meet Solis: the backpack that charges while you walk.\n" +
      "Two thin-film panels, one pocket-sized battery, enough juice to top up a phone twice a day. Pre-orders open today, first units ship in March…",
    coverGradient: "linear-gradient(135deg, #ffd36e 0%, #ff8a3d 55%, #f65e2e 100%)",
    coverEmoji: "🎒",
  },
  [PRESETS[1]]: {
    copy:
      "New: Dark mode\n" +
      "Flip the toggle in Settings and the whole app follows, editor included. We match your system theme by default and remember your choice across devices…",
    coverGradient: "linear-gradient(135deg, #3b3b54 0%, #1e1e2e 60%, #101018 100%)",
    coverEmoji: "🌙",
  },
  [PRESETS[2]]: {
    copy:
      "Subject: You're in! Welcome to the beta\n" +
      "Hi! Your account is live and your first canvas is waiting. Here are three small flows to try in your first ten minutes, plus where to send feedback…",
    coverGradient: "linear-gradient(135deg, #ff8ab5 0%, #ff5c96 55%, #b83280 100%)",
    coverEmoji: "👋",
  },
};

const FALLBACK_OUTPUT: MockOutput = {
  copy:
    "Big news: it's real, and you can try it today.\n" +
    "We've kept this one under wraps for a while. Here's what it does, why we built it, and how to get your hands on it in the next five minutes…",
  coverGradient: "linear-gradient(135deg, #ff8ab5 0%, #ff0072 60%, #a3005c 100%)",
  coverEmoji: "✨",
};

/**
 * A hands-on version of the hero canvas: the visitor types a prompt, presses
 * Run, and watches the same graph execute step by step. The output panel
 * mirrors the real run sidebar: one artifact per AI branch with its node's
 * duration, showing the content itself. The footnote says it's simulated.
 */
export function TryItLive() {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [running, setRunning] = useState(false);
  // The prompt as it was when the finished run started; null = no result yet.
  const [ranPrompt, setRanPrompt] = useState<string | null>(null);

  const output = (ranPrompt && MOCK_OUTPUTS[ranPrompt]) || FALLBACK_OUTPUT;

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
          setRanPrompt(prompt.trim() || PRESETS[0]);
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
                  <CheckCircle2 size={12} /> Run finished · 4.1s
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                <li className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="rounded-[6px] p-1 shrink-0"
                      style={{
                        backgroundColor: "rgba(var(--text__background-rgb), 1)",
                        color: "rgba(var(--text__font-rgb), 1)",
                      }}
                    >
                      <BotMessageSquare size={12} />
                    </span>
                    <span className="text-xs font-medium">copy.md</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">
                      Text AI · 1.8s
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-[11px] leading-relaxed text-[var(--muted-foreground)] [&::first-line]:font-medium">
                    {output.copy}
                  </p>
                </li>
                <li className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="rounded-[6px] p-1 shrink-0"
                      style={{
                        backgroundColor: "rgba(var(--image__background-rgb), 1)",
                        color: "rgba(var(--image__font-rgb), 1)",
                      }}
                    >
                      <Palette size={12} />
                    </span>
                    <span className="text-xs font-medium">cover.png</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">
                      Image AI · 2.3s
                    </span>
                  </div>
                  <div
                    className="flex h-16 items-center justify-center rounded-[6px] text-2xl"
                    style={{ background: output.coverGradient }}
                    role="img"
                    aria-label="Generated cover illustration"
                  >
                    {output.coverEmoji}
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">
                    1024 × 1024 · stored in your private bucket
                  </p>
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
