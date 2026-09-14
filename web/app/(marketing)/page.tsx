import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BotMessageSquare,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  History,
  ImageIcon,
  KeyRound,
  MessagesSquare,
  Play,
  ShieldCheck,
  Split,
  Type,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoFrame } from "@/components/landing/DemoFrame";
import { Reveal } from "@/components/landing/Reveal";
import { TryItLive } from "@/components/landing/TryItLive";

export const metadata: Metadata = {
  title: "FloowForge — AI workflows you can see running",
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
          <span className="text-[var(--primary)]"> watch running</span>.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
          Drag AI nodes onto a canvas and wire them together. Every run streams
          back live — node by node, with real timings — then ships as a webhook,
          a schedule, or a public form.
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

const BENTO_TILES = [
  {
    icon: <Workflow size={20} />,
    tone: "text",
    title: "A canvas that runs for real",
    body: "Build visually, save immutable versions, and watch per-node status, timings, and payloads stream back over Realtime while a run executes.",
  },
  {
    icon: <Webhook size={20} />,
    tone: "audio",
    name: "triggers",
    title: "Four front doors",
    body: "The same graph can be a webhook endpoint, a nightly schedule, a shareable public form, and a button on the canvas — at the same time.",
  },
  {
    icon: <Boxes size={20} />,
    tone: "file",
    title: "Compose bigger flows",
    body: "Wrap a saved flow as a single subflow node, or build reusable prompt-template nodes with their own inputs.",
  },
  {
    icon: <KeyRound size={20} />,
    tone: "image",
    title: "Bring your own keys",
    body: "Plug in your OpenAI, Gemini, Cloudflare, or DeepSeek keys — encrypted at rest, decrypted only when your flow calls the model.",
  },
  {
    icon: <FileText size={20} />,
    tone: "text",
    title: "Forms for non-builders",
    body: "Share a link; fields are derived from your canvas and answers are routed to the right nodes. No account needed to submit.",
  },
  {
    icon: <History size={20} />,
    tone: "audio",
    title: "Run history & resume",
    body: "Every run keeps its timeline. Jump into a failed run, inspect each node's inputs and outputs, and resume from the node that broke.",
  },
] as const;

function WhatYouGet() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)] scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="What you get"
          title="One canvas, every way to run it"
          body="Everything below ships today and works together on the same graph."
        />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENTO_TILES.map((tile, i) => (
          <Reveal key={tile.title} delay={i * 0.06}>
            <article className="card-surface card-hover p-6 h-full">
              <ToneIcon tone={tile.tone}>{tile.icon}</ToneIcon>
              <h3 className="font-semibold text-[1rem] mt-4">{tile.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{tile.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- how it works */

const STEPS = [
  {
    icon: <Workflow size={20} />,
    tone: "text",
    step: "Step 1",
    title: "Build on the canvas",
    body: "Drop nodes, drag between handles, and the editor works out execution order for you — step badges show exactly what runs in parallel.",
  },
  {
    icon: <Split size={20} />,
    tone: "image",
    step: "Step 2",
    title: "Choose how branches join",
    body: "Each node waits for all its parents (barrier) or fires on the first one (race). Multi-trigger canvases only run the branch you clicked.",
  },
  {
    icon: <Zap size={20} />,
    tone: "audio",
    step: "Step 3",
    title: "Watch it execute",
    body: "Runs stream back over Realtime: per-node status, durations, inputs and outputs, with resume-from-node when something needs a second try.",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)] scroll-mt-20">
      <Reveal>
        <SectionHeading
          eyebrow="How it works"
          title="From canvas to production in three moves"
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08}>
            <article className="card-surface card-hover p-6 h-full">
              <div className="flex items-center justify-between">
                <ToneIcon tone={s.tone}>{s.icon}</ToneIcon>
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {s.step}
                </span>
              </div>
              <h3 className="font-semibold text-[1rem] mt-4">{s.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{s.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- try */

function TrySection() {
  return (
    <section id="try" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)] scroll-mt-20">
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
      { icon: <Type size={16} />, name: "Text Box" },
      { icon: <ImageIcon size={16} />, name: "Image Box" },
      { icon: <MessagesSquare size={16} />, name: "Chat Box" },
      { icon: <FileText size={16} />, name: "File Box" },
    ],
    tone: "text",
  },
  {
    label: "AI",
    nodes: [
      { icon: <BotMessageSquare size={16} />, name: "Text AI" },
      { icon: <ImageIcon size={16} />, name: "Image AI" },
      { icon: <MessagesSquare size={16} />, name: "Audio AI" },
      { icon: <FileText size={16} />, name: "File Parser" },
    ],
    tone: "image",
  },
  {
    label: "Composition",
    nodes: [
      { icon: <Boxes size={16} />, name: "Subflow" },
      { icon: <Workflow size={16} />, name: "Custom prompt node" },
      { icon: <Zap size={16} />, name: "Run Button" },
      { icon: <Webhook size={16} />, name: "Webhook In" },
    ],
    tone: "audio",
  },
] as const;

const PROVIDERS = [
  { name: "OpenAI", icon: "/images/openai-icon-text.svg" },
  { name: "Google Gemini", icon: "/images/gemini-icon.svg" },
  { name: "Cloudflare Workers AI", icon: "/images/cloudflare-icon.svg" },
  { name: "DeepSeek", icon: "/images/deepseek-icon.svg" },
] as const;

function NodeCatalogue() {
  return (
    <section id="nodes" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)] scroll-mt-20">
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
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.nodes.map((n) => (
                  <li key={n.name} className="flex items-center gap-2.5 text-sm">
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
          <ul className="flex flex-wrap items-center justify-center gap-9 sm:gap-12">
            {PROVIDERS.map((p) => (
              <li key={p.name}>
                <Image
                  src={p.icon}
                  alt={p.name}
                  title={p.name}
                  width={44}
                  height={44}
                  className="size-10 sm:size-11 opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 hover:scale-110"
                />
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
  "Bring your own provider keys — encrypted at rest, decrypted only at call time.",
  "Generated media lives in a private bucket behind expiring signed URLs.",
  "Incoming webhooks are HMAC-signed; outgoing callbacks are signed too.",
  "Your run data is scoped to your account by row-level security.",
  "Rate limits are per account and per device — fair even on a shared campus network.",
] as const;

const LIMITS = [
  "The editor is built for desktop — there's no mobile canvas yet.",
  "No team accounts or sharing between users at the moment.",
  "Self-hosting works, but you'll need Supabase and Redis of your own.",
] as const;

function Transparency() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
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
    body: "AI calls run against the provider keys you connect, so model usage is billed by your provider at their prices — nothing marked up.",
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
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
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
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 border-t border-[var(--border)]">
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
