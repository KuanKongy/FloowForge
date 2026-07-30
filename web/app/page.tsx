import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BotMessageSquare,
  Boxes,
  CalendarClock,
  CheckCircle2,
  FileText,
  Github,
  ImageIcon,
  MessagesSquare,
  Play,
  ShieldCheck,
  Split,
  Type,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Button } from "@/components/ui/button";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { Reveal } from "@/components/landing/Reveal";
import { TryItLive } from "@/components/landing/TryItLive";

export const metadata: Metadata = {
  title: "FloowForge — AI workflows you can see running",
  description:
    "Drag AI nodes onto a canvas, wire them together, and expose the result as a webhook, a schedule, or a public form. Watch every node execute live.",
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-1)] text-[var(--foreground)]">
      <SiteHeader />
      <Hero />
      <TrySection />
      <HowItWorks />
      <TriggerSection />
      <NodeCatalogue />
      <Transparency />
      <ClosingCta />
      <SiteFooter />
    </main>
  );
}

/* ---------------------------------------------------------------- header */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[var(--surface-1)]/80 border-b border-[var(--border)]">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-5 sm:px-8 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[1.05rem]">
          <BrandWordmark />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link href="#how" className="hidden sm:block text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2">
            How it works
          </Link>
          <Link href="#nodes" className="hidden sm:block text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2">
            Nodes
          </Link>
          <Link href="/auth/sign-in">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </div>
    </header>
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
          <FlowDemo className="relative container-shadow" />
        </div>
        <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
          A real workflow shape: one trigger fans out to two AI nodes that run in
          parallel, then joins at a single result.
        </p>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------- try */

function TrySection() {
  return (
    <section id="try" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
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

/* ------------------------------------------------------------- how it works */

const STEPS = [
  {
    icon: <Workflow size={20} />,
    tone: "text",
    title: "Build on the canvas",
    body: "Drop nodes, drag between handles, and the editor works out execution order for you — step badges show exactly what runs in parallel.",
  },
  {
    icon: <Split size={20} />,
    tone: "image",
    title: "Choose how branches join",
    body: "Each node waits for all its parents (barrier) or fires on the first one (race). Multi-trigger canvases only run the branch you clicked.",
  },
  {
    icon: <Zap size={20} />,
    tone: "audio",
    title: "Watch it execute",
    body: "Runs stream back over Realtime: per-node status, durations, inputs and outputs, with resume-from-node when something needs a second try.",
  },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
      <Reveal>
        <SectionHeading
          eyebrow="How it works"
          title="From canvas to production in three moves"
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08}>
            <article className="card-surface p-6 h-full">
              <ToneIcon tone={s.tone}>{s.icon}</ToneIcon>
              <h3 className="font-semibold text-[1rem] mt-4">{s.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{s.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- triggers */

const TRIGGERS = [
  {
    icon: <Webhook size={18} />,
    tone: "audio",
    name: "Incoming webhook",
    body: "POST to a signed URL from any system. Requests are HMAC-verified and rate limited.",
  },
  {
    icon: <CalendarClock size={18} />,
    tone: "file",
    name: "Schedule",
    body: "Cron, daily, every-N, run-once, or run-after-a-delay — with timezone support.",
  },
  {
    icon: <FileText size={18} />,
    tone: "text",
    name: "Public form",
    body: "Share a link. Fields are derived from your canvas and routed straight to the right node.",
  },
  {
    icon: <ArrowRight size={18} />,
    tone: "image",
    name: "Outgoing callback",
    body: "When a run finishes, we POST the result back to your endpoint, signed with your secret.",
  },
] as const;

function TriggerSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
      <Reveal>
        <SectionHeading
          eyebrow="Triggers"
          title="Every flow has a front door"
          body="The same graph can be a webhook endpoint, a nightly job, and a shareable form at once."
        />
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {TRIGGERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.06}>
            <article className="card-surface p-5 flex gap-4 h-full">
              <ToneIcon tone={t.tone} small>{t.icon}</ToneIcon>
              <div className="min-w-0">
                <h3 className="font-semibold text-[0.95rem]">{t.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t.body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
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

const PROVIDERS = ["OpenAI", "Google Gemini", "Cloudflare Workers AI", "DeepSeek"];

function NodeCatalogue() {
  return (
    <section id="nodes" className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 border-t border-[var(--border)]">
      <Reveal>
        <SectionHeading
          eyebrow="What's in the box"
          title="The nodes you actually get"
          body="Every node listed here ships today. Compose them, or wrap a whole flow as a single reusable node."
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {NODE_GROUPS.map((group, i) => (
          <Reveal key={group.label} delay={i * 0.08}>
            <div className="card-surface p-5 h-full">
              <h3 className="font-semibold text-[0.9rem] text-[var(--muted-foreground)] uppercase tracking-wide text-[0.7rem]">
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

      <Reveal delay={0.2} className="mt-8">
        <div className="card-surface p-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span className="text-sm text-[var(--muted-foreground)]">Powered by</span>
          {PROVIDERS.map((p) => (
            <span key={p} className="text-sm font-medium">{p}</span>
          ))}
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
          eyebrow="Straight answers"
          title="What we do, and what we don't"
          body="Worth knowing before you build something important on it."
        />
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Reveal>
          <div className="card-surface p-6 h-full">
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
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="card-surface p-6 h-full">
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
            <Link href="/auth/sign-up" className="inline-block mt-7">
              <Button size="lg">
                Create your account <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <BrandWordmark />
        <p className="text-xs text-[var(--muted-foreground)] order-last sm:order-none">
          A no-code AI workflow platform. Successor to Floowbox.
        </p>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/auth/sign-in" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            Sign in
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </footer>
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
