"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { FlowDemo } from "./FlowDemo";

/**
 * The hero's demo chrome: FlowDemo plus a narrated caption, progress dots
 * bound to the topological step currently executing, and a pause button —
 * the story of one run, told while it plays.
 *
 * OnboardBuddy-style layout: the caption sits in a fixed-size block above the
 * controls so nothing shifts as the text changes, and the dots are buttons —
 * clicking one pauses the loop and poses the canvas at that exact step.
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
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualStep, setManualStep] = useState<number | null>(null);

  const shownStep = manualStep ?? step;
  const caption = STEP_CAPTIONS[shownStep] ?? STEP_CAPTIONS[0];

  function selectStep(s: number) {
    setManualStep(s);
    setPaused(true);
  }

  function togglePlay() {
    if (paused) {
      // Resume with a clean run rather than mid-scrub state.
      setManualStep(null);
      setStep(0);
      setPaused(false);
    } else {
      setPaused(true);
    }
  }

  return (
    <figure className={className}>
      <FlowDemo
        className="relative container-shadow"
        paused={paused}
        stepOverride={manualStep}
        onStepChange={setStep}
      />
      <figcaption className="mt-4 text-center">
        {/* Fixed-height, fixed-width caption box: the text fades in place and
            the controls below never move. */}
        <div className="mx-auto max-w-[620px] h-[60px] sm:h-[44px] overflow-hidden text-xs sm:text-[13px] leading-relaxed text-[var(--muted-foreground)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={shownStep}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <span className="font-medium text-[var(--foreground)]">{caption.title}</span>{" "}
              {caption.body}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="mt-1.5 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={paused ? "Play the demo" : "Pause the demo"}
            onClick={togglePlay}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
          <span className="flex items-center">
            {DOT_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Show step ${s}: ${STEP_CAPTIONS[s].title}`}
                aria-current={shownStep === s}
                onClick={() => selectStep(s)}
                className="group p-1.5 cursor-pointer"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    shownStep === s
                      ? "bg-[var(--primary)]"
                      : "bg-[var(--font--light)] group-hover:bg-[var(--muted-foreground)]"
                  }`}
                  style={{ width: shownStep === s ? 20 : 8 }}
                />
              </button>
            ))}
          </span>
        </div>
      </figcaption>
    </figure>
  );
}
