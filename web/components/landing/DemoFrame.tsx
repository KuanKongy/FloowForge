"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { FlowDemo } from "./FlowDemo";

/**
 * The hero's demo chrome: FlowDemo plus a narrated caption, progress dots
 * bound to the topological step currently executing, and a pause button —
 * the story of one run, told while it plays.
 */

const STEP_CAPTIONS: Record<number, { title: string; body: string }> = {
  0: {
    title: "Watch a run.",
    body: "One trigger, two AI nodes in parallel, one joined result — live.",
  },
  1: {
    title: "The trigger fires.",
    body: "A webhook, schedule, form, or button starts the run server-side.",
  },
  2: {
    title: "Inputs resolve.",
    body: "The prompt is read from the saved canvas — runs use immutable versions.",
  },
  3: {
    title: "AI runs in parallel.",
    body: "Copy and cover art execute at the same time; step badges show why.",
  },
  4: {
    title: "Branches join.",
    body: "The result lands in one node, streamed back with per-node timings.",
  },
};

const DOT_STEPS = [1, 2, 3, 4] as const;

export function DemoFrame({ className = "" }: { className?: string }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const caption = STEP_CAPTIONS[step] ?? STEP_CAPTIONS[0];

  return (
    <figure className={className}>
      <FlowDemo
        className="relative container-shadow"
        paused={paused}
        onStepChange={setStep}
      />
      <figcaption className="mt-3 flex items-center justify-center gap-3 text-xs text-[var(--muted-foreground)]">
        <button
          type="button"
          aria-label={paused ? "Play the demo" : "Pause the demo"}
          onClick={() => setPaused((v) => !v)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          {paused ? <Play size={11} /> : <Pause size={11} />}
        </button>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {DOT_STEPS.map((s) => (
            <span
              key={s}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: step === s ? 16 : 6,
                background:
                  step === s ? "var(--primary)" : "var(--font--light)",
              }}
            />
          ))}
        </span>
        <span className="min-w-0 truncate sm:whitespace-normal sm:truncate-none text-left">
          <span className="font-medium text-[var(--foreground)]">{caption.title}</span>{" "}
          <span className="hidden sm:inline">{caption.body}</span>
        </span>
      </figcaption>
    </figure>
  );
}
