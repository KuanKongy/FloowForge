import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BotMessageSquare,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  History,
  ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  MessagesSquare,
  Palette,
  Play,
  RotateCcw,
  ShieldCheck,
  Split,
  Type,
  Webhook,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoFrame } from "@/components/landing/DemoFrame";
import { Reveal } from "@/components/landing/Reveal";
import { TryItLive } from "@/components/landing/TryItLive";

export const metadata: Metadata = {
  title: "FloowForge · AI workflows you can watch running",
  description:
    "Drag AI nodes onto a canvas, wire them together, and expose the result as a webhook, a schedule, or a public form. Watch every node execute live.",
};

/**
 * The landing narrative, top to bottom: what it is (hero + live demo) →
 * what you get → how it works → try it yourself → what's in the
 * box → how your data is handled → what it costs → start.
 */
export default function LandingPage() {
  return (
    <main>
      <Hero />
      <WhatYouGet />
      <HowItWorks />
      <TrySection />
      <NodeCatalogue />
      <Transparency />
      <TransparentCosts />
      <ClosingCta />
    </main>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 pb-12 sm:pt-24 sm:pb-16">
      <Reveal onMount className="text-center max-w-3xl mx-auto">
        <span className="inline-flex items-center gap-1.5 pill border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-foreground)]">
          <Zap size={12} className="text-[var(--primary)]" />
          Visual AI workflows, running server-side
        </span>
        <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          AI workflows you can
          <span className="text-[var(--primary)]"> watch running</span>
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
          Drag AI nodes onto a canvas and wire them together. Every run streams
          back live, node by node with real timings, then ships as a webhook, a
          schedule, or a public form.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/auth/sign-up" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto justify-center">
              Start building <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="#try" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto justify-center">
              <Play size={15} /> See it run
            </Button>
          </Link>
        </div>
      </Reveal>

      <Reveal onMount delay={0.15} className="mt-12 sm:mt-16">
        <div className="relative">
          {/* Soft brand glow behind the canvas. */}
          <div
            aria-hidden="true"
            className="absolute -inset-x-8 -inset-y-6 rounded-[32px] opacity-60 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 40%, rgba(var(--primary-rgb), 0.14), transparent 70%)",
            }}
          />
          <DemoFrame className="relative" />
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ what you get */

/**
 * OnboardBuddy-style bento: every panel carries a miniature artifact from the
 * actual product (a streaming run, trigger rows, masked keys, a form, a failed
 * run) instead of a paragraph, so the section shows rather than tells.
 *
 * Compact on purpose (inline headers, tight gaps) so the whole grid fits one
 * screen. Narrative order: build & watch it run → ship it four ways → share it
 * as a form → your keys, your bill → compose bigger → recover when it breaks.
 */
function WhatYouGet() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="What you get"
          title="One canvas, every way to run it"
          body="Everything below ships today and works together on the same graph."
        />
      </Reveal>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {/* Row 1: the core promise (wide) + how it ships. */}
        <Reveal className="lg:col-span-2">
          <article className="card-surface card-hover p-5 h-full sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5 sm:items-center sm:content-center">
            <div>
              <TileHeader tone="text" icon={<Workflow size={17} />} title="A canvas that runs for real" />
              <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
                Build visually, save immutable versions, and watch status,
                timings, and payloads stream back live, node by node, while a
                run executes.
              </p>
            </div>
            <MockRunStream />
          </article>
        </Reveal>
        <Reveal delay={0.06}>
          <article className="card-surface card-hover p-5 h-full">
            <TileHeader tone="audio" icon={<Webhook size={17} />} title="Four front doors" />
            <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
              The same graph answers to all of these at once.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {FRONT_DOORS.map((door) => (
                <li
                  key={door.label}
                  className="flex items-center justify-between gap-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1"
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <span
                      className="rounded-[6px] p-1 shrink-0"
                      style={{
                        backgroundColor: `rgba(var(--${door.tone}__background-rgb), 1)`,
                        color: `rgba(var(--${door.tone}__font-rgb), 1)`,
                      }}
                    >
                      {door.icon}
                    </span>
                    {door.label}
                  </span>
                  <code className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {door.detail}
                  </code>
                </li>
              ))}
            </ul>
          </article>
        </Reveal>

        {/* Row 2: share it, pay the provider directly, compose bigger. */}
        <Reveal delay={0.06}>
          <article className="card-surface card-hover p-5 h-full">
            <TileHeader tone="text" icon={<FileText size={17} />} title="Forms for non-builders" />
            <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
              Turn a flow into a shareable form. Answers route to the right
              nodes; no account needed to submit.
            </p>
            <MockForm />
          </article>
        </Reveal>
        <Reveal delay={0.12}>
          <article className="card-surface card-hover p-5 h-full">
            <TileHeader tone="image" icon={<KeyRound size={17} />} title="Bring your own keys" />
            <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
              Encrypted at rest, decrypted only when your flow calls the model.
              No markup on usage.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {KEY_ROWS.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1"
                >
                  <Image
                    src={row.icon}
                    alt=""
                    width={14}
                    height={14}
                    className="provider-mark size-3.5 opacity-70 grayscale"
                  />
                  <span className="text-xs font-medium">{row.name}</span>
                  <code className="ml-auto text-[10px] text-[var(--muted-foreground)]">
                    {row.masked}
                  </code>
                  <Lock size={10} className="shrink-0 text-[var(--image__font)]" />
                </li>
              ))}
            </ul>
          </article>
        </Reveal>
        <Reveal delay={0.18}>
          <article className="card-surface card-hover p-5 h-full">
            <TileHeader tone="file" icon={<Boxes size={17} />} title="Compose bigger flows" />
            <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
              Wrap a saved flow as a single subflow node, or build reusable
              prompt-template nodes with their own inputs.
            </p>
            <MockSubflow />
          </article>
        </Reveal>

        {/* Row 3: the safety net, as a finale. */}
        <Reveal className="lg:col-span-3">
          <article className="card-surface card-hover p-5 h-full grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
            <div>
              <TileHeader tone="audio" icon={<History size={17} />} title="Run history & resume" />
              <p className="mt-2.5 text-sm text-[var(--muted-foreground)]">
                Every run keeps its timeline. Jump into a failed run, inspect
                each node&apos;s inputs and outputs, and resume from the node
                that broke. Earlier results are reused, not re-billed.
              </p>
            </div>
            <MockFailedRun />
          </article>
        </Reveal>
      </div>
    </section>
  );
}

/** Inline card header: small tone icon and title on one row (OnboardBuddy). */
function TileHeader({
  tone,
  icon,
  title,
}: {
  tone: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <ToneIcon tone={tone} small>
        {icon}
      </ToneIcon>
      <h3 className="font-semibold text-[0.95rem]">{title}</h3>
    </div>
  );
}

const FRONT_DOORS = [
  { icon: <Webhook size={12} />, tone: "audio", label: "Webhook", detail: "POST /t/wh_9f2c…" },
  { icon: <CalendarClock size={12} />, tone: "file", label: "Schedule", detail: "daily · 07:00" },
  { icon: <FileText size={12} />, tone: "text", label: "Public form", detail: "/f/launch-brief" },
  { icon: <Zap size={12} />, tone: "image", label: "Run button", detail: "on the canvas" },
] as const;

const KEY_ROWS = [
  { name: "OpenAI", icon: "/images/openai-icon-text.svg", masked: "sk-••••••••3kF" },
  { name: "Gemini", icon: "/images/gemini-icon.svg", masked: "AIza••••••q8w" },
  { name: "Cloudflare", icon: "/images/cloudflare-icon.svg", masked: "cf_••••••••t2m" },
  { name: "DeepSeek", icon: "/images/deepseek-icon.svg", masked: "sk-••••••••9dA" },
] as const;

/** The live-run artifact: a run sidebar mid-stream, one node still working. */
function MockRunStream() {
  return (
    <div
      className="mt-4 sm:mt-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-2.5 sm:w-[250px]"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Run #142
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--primary)]">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[var(--primary)]" />
          </span>
          streaming
        </span>
      </div>
      <ul className="pt-1.5 flex flex-col gap-1">
        <MockRunRow step={1} name="Webhook In" time="0.1s" state="done" />
        <MockRunRow step={2} name="Prompt" time="0.0s" state="done" />
        <MockRunRow step={3} name="Copywriter" time="1.8s" state="done" />
        <MockRunRow step={3} name="Cover art" time="2.3s…" state="running" />
      </ul>
    </div>
  );
}

function MockRunRow({
  step,
  name,
  time,
  state,
}: {
  step: number;
  name: string;
  time: string;
  state: "done" | "running" | "failed";
}) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="size-[16px] shrink-0 rounded-full text-[9px] font-semibold flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted-foreground)]">
        {step}
      </span>
      <span className={`font-medium truncate ${state === "failed" ? "text-red-500" : ""}`}>{name}</span>
      <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] tabular-nums">
        {time}
        {state === "done" && <Check size={11} className="text-[var(--image__font)]" />}
        {state === "running" && <Loader2 size={11} className="animate-spin text-[var(--primary)]" />}
        {state === "failed" && <XCircle size={11} className="text-red-500" />}
      </span>
    </li>
  );
}

/** A saved flow collapsed into one node, shown next to its innards. */
function MockSubflow() {
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-2.5" aria-hidden="true">
      <div className="relative rounded-[10px] border border-[rgba(var(--file__font-rgb),0.4)] bg-[var(--surface-2)] px-2.5 py-1.5 flex items-center gap-2">
        <span
          className="rounded-[7px] p-1.5 shrink-0"
          style={{
            backgroundColor: "rgba(var(--file__background-rgb), 1)",
            color: "rgba(var(--file__font-rgb), 1)",
          }}
        >
          <Boxes size={14} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold leading-tight">Launch kit</span>
          <span className="block text-[9px] text-[var(--muted-foreground)]">Subflow · one node</span>
        </span>
        <span className="absolute -top-2 -left-2 size-[16px] rounded-full text-[9px] font-semibold flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted-foreground)]">
          2
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
        <span className="shrink-0">inside:</span>
        <span className="flex items-center gap-1 min-w-0">
          <MockMiniNode tone="text" label="Draft" />
          <span className="w-2.5 border-t border-dashed border-[var(--font--light)]" />
          <MockMiniNode tone="image" label="Art" />
          <span className="w-2.5 border-t border-dashed border-[var(--font--light)]" />
          <MockMiniNode tone="file" label="Pack" />
        </span>
      </div>
    </div>
  );
}

function MockMiniNode({ tone, label }: { tone: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--foreground)]"
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: `rgba(var(--${tone}__font-rgb), 0.7)` }}
      />
      {label}
    </span>
  );
}

/** The public form artifact: two derived fields and a submit that starts a run. */
function MockForm() {
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-2.5 flex flex-col gap-1.5" aria-hidden="true">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Launch brief
      </span>
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">
        Product name…
      </div>
      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">
        What are we announcing?
      </div>
      <div className="rounded-[8px] bg-[var(--primary)] px-2.5 py-1 text-center text-[11px] font-medium text-white">
        Submit &amp; watch it run
      </div>
    </div>
  );
}

/** A failed run with resume: the point of run history, in one glance. */
function MockFailedRun() {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-2.5" aria-hidden="true">
      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Run #137 · yesterday 23:04
        </span>
        <span className="text-[10px] font-medium text-red-500">failed</span>
      </div>
      <ul className="pt-1.5 flex flex-col gap-1">
        <MockRunRow step={1} name="Webhook In" time="0.1s" state="done" />
        <MockRunRow step={2} name="Copywriter" time="1.8s" state="done" />
        <MockRunRow step={3} name="Cover art" time="provider 429" state="failed" />
      </ul>
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[8px] border border-[rgba(var(--primary-rgb),0.35)] bg-[rgba(var(--primary-rgb),0.06)] px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--primary)]">
          <RotateCcw size={11} /> Resume from Cover art
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">reuses steps 1–2</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- how it works */

const STEPS = [
  {
    icon: <Workflow size={22} />,
    tone: "text",
    step: 1,
    title: "Build on the canvas",
    body: "Drop nodes, drag between handles, and the editor works out execution order for you. Step badges show exactly what runs in parallel.",
  },
  {
    icon: <Split size={22} />,
    tone: "image",
    step: 2,
    title: "Choose how branches join",
    body: "Each node waits for all its parents (barrier) or fires on the first one (race). Multi-trigger canvases only run the branch you clicked.",
  },
  {
    icon: <Zap size={22} />,
    tone: "audio",
    step: 3,
    title: "Watch it execute",
    body: "Runs stream back over Realtime: per-node status, durations, inputs and outputs, with resume-from-node when something needs a second try.",
  },
] as const;

/**
 * The three moves are drawn as a flow: icon tiles sit on one dashed edge with
 * an arrowhead, the same visual language as the canvas itself. On phones the
 * edge runs vertically down a left rail.
 */
function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="How it works"
          title="From canvas to production in three moves"
        />
      </Reveal>

      {/* Desktop: horizontal edge through the icons. */}
      <div className="mt-12 hidden md:block relative">
        <div
          aria-hidden="true"
          className="step-connector absolute left-[16.67%] right-[16.67%] top-[27px] h-[2px]"
        />
        <ChevronRight
          aria-hidden="true"
          size={18}
          className="absolute right-[16.67%] top-[27px] -translate-y-1/2 translate-x-2.5 text-[rgba(var(--primary-rgb),0.55)]"
        />
        <ol className="grid grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              {/* The whole step is the hover area: a ghost card materializes
                  over the edge and the node icon lifts, like hovering a node
                  on the canvas. `p-4 -m-4` grows the hit area without moving
                  the icon off the connector line. */}
              <li className="group flex flex-col items-center text-center rounded-[18px] p-4 -m-4 border border-transparent transition-all duration-300 hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                <StepIcon step={s.step} tone={s.tone}>
                  {s.icon}
                </StepIcon>
                <span className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                  Step {s.step}
                </span>
                <h3 className="mt-1.5 font-semibold text-[1.05rem]">{s.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-xs">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>

      {/* Mobile: the same edge, running down a left rail. */}
      <div className="mt-10 md:hidden relative">
        <div
          aria-hidden="true"
          className="step-connector-v absolute left-[27px] top-[28px] bottom-[36px] w-[2px]"
        />
        <ol className="flex flex-col gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <li className="group flex gap-4">
                <StepIcon step={s.step} tone={s.tone}>
                  {s.icon}
                </StepIcon>
                <div className="pt-0.5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                    Step {s.step}
                  </span>
                  <h3 className="mt-0.5 font-semibold text-[1rem]">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">{s.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** An icon tile posed as a node on the edge: tone-tinted, topo badge and all. */
function StepIcon({
  step,
  tone,
  children,
}: {
  step: number;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative z-10 inline-flex shrink-0 rounded-[16px] bg-[var(--background)] p-1 transition-transform duration-300 group-hover:scale-110">
      <span
        className="inline-flex size-12 items-center justify-center rounded-[13px] border"
        style={{
          backgroundColor: `rgba(var(--${tone}__background-rgb), 1)`,
          color: `rgba(var(--${tone}__font-rgb), 1)`,
          borderColor: `rgba(var(--${tone}__font-rgb), 0.25)`,
        }}
      >
        {children}
      </span>
      <span className="absolute -top-1 -left-1 size-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted-foreground)]">
        {step}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- try */

function TrySection() {
  return (
    <section id="try" className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="Hands on"
          title="Run one yourself"
          body="No sign-up. Type a prompt, press Run, and watch the same graph execute."
        />
      </Reveal>
      <Reveal delay={0.1} className="mt-8">
        <TryItLive />
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ node catalogue */

/**
 * Mirrors the node registry in `packages/shared` and the editor palette. Kept
 * in one place so the marketing copy cannot drift from what actually ships.
 */
const NODE_GROUPS = [
  {
    label: "Inputs & display",
    nodes: [
      { icon: <Type size={16} />, name: "Text Box", desc: "Type or paste text; feeds anything downstream." },
      { icon: <ImageIcon size={16} />, name: "Image Box", desc: "Upload an image, or display a generated one." },
      { icon: <MessagesSquare size={16} />, name: "Chat Box", desc: "A chat window that lives inside your flow." },
      { icon: <FileText size={16} />, name: "File Box", desc: "Bring files into the run, up to 25 MB." },
    ],
    tone: "text",
  },
  {
    label: "AI",
    nodes: [
      { icon: <BotMessageSquare size={16} />, name: "Text AI", desc: "GPT, Gemini, Llama, or DeepSeek writes for you." },
      { icon: <Palette size={16} />, name: "Image AI", desc: "GPT Image, DreamShaper, or Flux paints for you." },
      { icon: <MessagesSquare size={16} />, name: "Audio AI", desc: "TTS-1 or Aura 2 turns text into speech." },
      { icon: <FileText size={16} />, name: "File Parser", desc: "Extracts the text out of an uploaded PDF." },
    ],
    tone: "image",
  },
  {
    label: "Composition",
    nodes: [
      { icon: <Boxes size={16} />, name: "Subflow", desc: "A whole saved flow, used as a single node." },
      { icon: <Workflow size={16} />, name: "Custom prompt node", desc: "Your reusable prompt template, with inputs." },
      { icon: <Zap size={16} />, name: "Run Button", desc: "Starts its branch right on the canvas." },
      { icon: <Webhook size={16} />, name: "Webhook In", desc: "A tokenized URL other systems can POST to." },
    ],
    tone: "audio",
  },
] as const;

/** Brand-colored marks (separate from the app's monochrome icon set). */
const PROVIDERS = [
  { name: "OpenAI", icon: "/images/brand/openai.svg", mono: true },
  { name: "Google Gemini", icon: "/images/brand/gemini.svg", mono: false },
  { name: "Cloudflare", icon: "/images/brand/cloudflare.svg", mono: false },
  { name: "DeepSeek", icon: "/images/brand/deepseek.svg", mono: false },
] as const;

function NodeCatalogue() {
  return (
    <section id="nodes" className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="What's in the box"
          title="The nodes you actually get"
          body="Every node listed here ships today. Compose them, or wrap a whole flow as a single reusable node."
        />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        {NODE_GROUPS.map((group, i) => (
          <Reveal key={group.label} delay={i * 0.08}>
            <div className="card-surface card-hover p-5 h-full">
              <h3 className="font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[0.7rem]">
                {group.label}
              </h3>
              <ul className="mt-4 flex flex-col gap-1">
                {group.nodes.map((n) => (
                  <li key={n.name} className="group/node relative">
                    <span className="flex items-center gap-2.5 text-sm rounded-[9px] px-1.5 py-1.5 -mx-1.5 transition-colors duration-200 group-hover/node:bg-[var(--muted)]">
                      <span
                        className="rounded-[8px] p-1.5 shrink-0"
                        style={{
                          backgroundColor: `rgba(var(--${group.tone}__background-rgb), 1)`,
                          color: `rgba(var(--${group.tone}__font-rgb), 1)`,
                        }}
                      >
                        {n.icon}
                      </span>
                      {n.name}
                    </span>
                    {/* Tooltip: fades and lifts in on hover, above the row. */}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-0 bottom-[calc(100%+6px)] z-20 whitespace-nowrap rounded-[8px] bg-[#111827] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg opacity-0 translate-y-1 transition-all duration-200 ease-out group-hover/node:opacity-100 group-hover/node:translate-y-0 group-hover/node:delay-150"
                    >
                      {n.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.2} className="mt-12">
        <div className="flex flex-col items-center gap-5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Powered by
          </span>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-10">
            {PROVIDERS.map((p) => (
              <li key={p.name} className="group flex items-center gap-2.5">
                <Image
                  src={p.icon}
                  alt=""
                  width={28}
                  height={28}
                  className={`size-6 sm:size-7 transition-transform duration-300 group-hover:scale-110 ${
                    p.mono ? "dark-invert" : ""
                  }`}
                />
                <span className="text-sm font-medium text-[var(--muted-foreground)] transition-colors duration-300 group-hover:text-[var(--foreground)]">
                  {p.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------- transparency */

const FACTS = [
  "Bring your own provider keys, encrypted at rest and decrypted only at call time.",
  "Generated media lives in a private bucket behind expiring signed URLs.",
  "Incoming webhooks are HMAC-signed; outgoing callbacks are signed too.",
  "Your run data is scoped to your account by row-level security.",
  "Rate limits are per account and per device, fair even on a shared campus network.",
] as const;

const LIMITS = [
  "The editor is built for desktop; there's no mobile canvas yet.",
  "No team accounts or sharing between users at the moment.",
  "Self-hosting works, but you'll need Supabase and Redis of your own.",
] as const;

function Transparency() {
  return (
    <section id="privacy" className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16 scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="Your data, your rules"
          title="What we do, and what we don't"
          body="Worth knowing before you build something important on it."
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Reveal>
          <div className="card-surface card-hover p-6 h-full">
            <ToneIcon tone="image" small>
              <ShieldCheck size={18} />
            </ToneIcon>
            <h3 className="font-semibold mt-4">How your data is handled</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {FACTS.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-[var(--muted-foreground)]">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[var(--image__font)]" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--muted-foreground)]">
              The details live in the{" "}
              <Link href="/privacy" className="underline hover:text-[var(--foreground)]">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="card-surface card-hover p-6 h-full">
            <ToneIcon tone="file" small>
              <Boxes size={18} />
            </ToneIcon>
            <h3 className="font-semibold mt-4">Not there yet</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-2.5 text-sm text-[var(--muted-foreground)]">
                  <span className="shrink-0 mt-2 size-1.5 rounded-full bg-[var(--font--light)]" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- costs */

const COST_FACTS = [
  {
    icon: <Eye size={18} />,
    tone: "audio",
    title: "Free while in beta",
    body: "Accounts, flows, triggers, forms, and run history cost nothing today. If paid tiers ever arrive, you'll get notice first.",
  },
  {
    icon: <KeyRound size={18} />,
    tone: "image",
    title: "Your keys, your bill",
    body: "AI calls run against the provider keys you connect, so model usage is billed by your provider at their prices, with nothing marked up.",
  },
  {
    icon: <CalendarClock size={18} />,
    tone: "text",
    title: "Fair-use limits",
    body: "Generous per-account rate limits keep the service healthy for everyone; a normal user never notices them.",
  },
] as const;

function TransparentCosts() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
      <Reveal>
        <SectionHeading
          eyebrow="Transparent costs"
          title="No surprises on the bill"
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {COST_FACTS.map((fact, i) => (
          <Reveal key={fact.title} delay={i * 0.08}>
            <article className="card-surface card-hover p-6 h-full">
              <ToneIcon tone={fact.tone} small>
                {fact.icon}
              </ToneIcon>
              <h3 className="font-semibold mt-4">{fact.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{fact.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- closing */

function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20">
      <Reveal>
        <div className="card-surface p-8 sm:p-12 text-center relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70 pointer-events-none"
            style={{
              background:
                "radial-gradient(70% 120% at 50% 0%, rgba(var(--primary-rgb), 0.08), transparent 65%)",
            }}
          />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Build your first flow in a few minutes
            </h2>
            <p className="mt-3 text-[var(--muted-foreground)] max-w-lg mx-auto">
              Free to start, and you can plug in your own provider keys whenever
              you&apos;re ready.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/auth/sign-up" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto justify-center">
                  Create your account <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/faq" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto justify-center">
                  <BookOpen size={15} /> Read the FAQ
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------- primitives */

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-3 text-[var(--muted-foreground)]">{body}</p>}
    </div>
  );
}

function ToneIcon({
  tone,
  small = false,
  children,
}: {
  tone: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-[10px] shrink-0 ${small ? "p-2" : "p-2.5"}`}
      style={{
        backgroundColor: `rgba(var(--${tone}__background-rgb), 1)`,
        color: `rgba(var(--${tone}__font-rgb), 1)`,
      }}
    >
      {children}
    </div>
  );
}
