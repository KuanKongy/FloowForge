import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * The FAQ content, shared verbatim between the public /faq page and the
 * in-app /app/faq page so the two can never drift apart. Each page brings its
 * own chrome (hero + reveal animations vs. dashboard header) and renders
 * sections via <FaqSection />.
 */

export type QA = { q: string; a: React.ReactNode };
export type FaqSectionData = { id: string; title: string; items: QA[] };

export const FAQ_SECTIONS: FaqSectionData[] = [
  {
    id: "basics",
    title: "The basics",
    items: [
      {
        q: "What is FloowForge?",
        a: "FloowForge is a no-code platform for building AI workflows. You drag nodes onto a canvas — text boxes, AI models, image generators, file parsers — wire them together, and run the whole graph server-side. Every run streams back live, node by node, with real timings and payloads.",
      },
      {
        q: "Who is it for?",
        a: "Anyone who wants to chain AI steps together without writing code: students prototyping ideas, builders automating repetitive prompting, and teams that want to hand a workflow to non-technical users as a simple form link.",
      },
      {
        q: "Do I need to know how to code?",
        a: "No. Building, running, and sharing workflows is entirely visual. The closest thing to code is writing prompts, and connecting a webhook if you want another system to trigger your flow.",
      },
      {
        q: "What does it cost?",
        a: "FloowForge is free while in beta. AI model calls run against the provider keys you connect, so model usage is billed directly by your provider at their prices — FloowForge adds no markup. If paid tiers are ever introduced, existing users get notice first.",
      },
      {
        q: "Does it work on my phone?",
        a: "The landing pages, forms you share, and legal pages work everywhere. The workflow editor itself is built for desktop — there's no mobile canvas yet.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts & sign-in",
    items: [
      {
        q: "How do I create an account?",
        a: "Sign up with an email and password, or use your Google account. Authentication is handled by Supabase Auth; FloowForge never sees or stores your password.",
      },
      {
        q: "Can other users see my flows or runs?",
        a: "No. Every flow, run, trigger, and integration is scoped to your account with database row-level security. There are no team accounts or sharing between users yet — the only thing you can share is a public form link, which exposes exactly the fields you chose and nothing else.",
      },
      {
        q: "How do I sign out or manage my account?",
        a: "The Profile page in the dashboard shows your account email and lets you sign out. To have your account and data deleted, contact us (see the Contact page).",
      },
    ],
  },
  {
    id: "editor",
    title: "The canvas & editor",
    items: [
      {
        q: "How does the editor work?",
        a: "Open a workflow and you get a full-screen canvas. Drag nodes from the palette, drop them anywhere, and connect them by dragging between the handles that appear when your cursor comes close. Nodes can be renamed, collapsed, and deleted; edges have a small × badge to remove them.",
      },
      {
        q: "What are the little step numbers on nodes?",
        a: "Topological step badges. The editor works out execution order from your connections and labels each node with the step it will run in — nodes sharing a number run in parallel. It's the same order the engine uses for real runs.",
      },
      {
        q: "What do Barrier and Race mean?",
        a: "They control how a node with several parents joins its branches. Barrier (the default) waits for all parents to finish before running; Race fires as soon as the first parent finishes. You can set this per node.",
      },
      {
        q: "What happens when I save?",
        a: "Saving creates an immutable version of your flow. Runs always execute a saved version — never the live canvas — so a run can't be corrupted by edits you make while it executes, and your history stays reproducible.",
      },
      {
        q: "Why does part of my canvas dim when I click a Run button?",
        a: "A canvas can have several triggers (buttons, webhooks, manual inputs). Clicking one runs only its downstream subgraph; everything that wouldn't execute dims so you can see exactly what that trigger covers.",
      },
    ],
  },
  {
    id: "nodes",
    title: "Nodes",
    items: [
      {
        q: "What nodes are there?",
        a: "Sixteen types across three groups. Inputs & display: Text Box, Image Box, Audio Box, File Box, Chat Box, plus Header and Run Button. AI: Text AI, Image AI, Audio AI, and File Parser. Composition & triggers: Subflow, Custom prompt node, Webhook In, Manual In, and Schedule In.",
      },
      {
        q: "Which AI models can I use?",
        a: "Text: GPT o3-mini, GPT-4o-mini, Gemini 2.5 Flash, Gemini 2.5 Flash Lite, Llama 3.1 (Cloudflare), and DeepSeek. Images: GPT Image 1, DreamShaper, and Flux Schnell. Audio: TTS-1 and Aura 2. Files: PDF text extraction. The list grows as providers ship models.",
      },
      {
        q: "How do AI nodes get their inputs?",
        a: "From their connected parent nodes. A Text AI node with a Text Box parent uses that text as its prompt; connect several parents and each becomes an input. The run sidebar shows exactly what every node received and produced.",
      },
      {
        q: "What does the File Parser do?",
        a: "It extracts text from an uploaded PDF (up to 25 MB) so downstream AI nodes can work with the document's content.",
      },
    ],
  },
  {
    id: "custom-nodes",
    title: "Custom nodes & subflows",
    items: [
      {
        q: "What is a custom node?",
        a: "A reusable prompt template you build once and use like any other node. It has as many inputs as you like and one output; on the canvas, each connected parent fills one of the template's variables.",
      },
      {
        q: "What is a subflow?",
        a: "A whole saved flow used as a single node inside another flow. Build a polished pipeline once, then compose it into bigger workflows without duplicating anything.",
      },
    ],
  },
  {
    id: "triggers",
    title: "Triggers",
    items: [
      {
        q: "What ways are there to start a workflow?",
        a: "Four: press a Run button on the canvas; POST to an incoming webhook URL; let a schedule fire it; or share a public form. The same flow can have all of them at once, each scoped to its own entry node.",
      },
      {
        q: "How do incoming webhooks work?",
        a: "Each webhook trigger gets a unique tokenized URL and a signing secret. Requests are HMAC-verified (signature plus timestamp, 5-minute window) and rate limited, and bodies are capped at 1 MB. The webhook's payload becomes the run's input.",
      },
      {
        q: "What schedule options exist?",
        a: "Five modes, all timezone-aware: cron expressions, daily at a fixed time, every N hours/minutes/seconds, run once after a delay, and run once at a specific date and time. The dashboard shows each schedule's next fire time.",
      },
      {
        q: "What are outgoing callbacks?",
        a: "When a run finishes, FloowForge can POST the result to a URL you choose, signed with your secret so your server can verify it really came from your workflow.",
      },
      {
        q: "Can I pick which part of the flow a trigger runs?",
        a: "Yes. Each trigger is bound to an entry node, and only that node's downstream branch executes. That's how one canvas can serve several distinct jobs.",
      },
    ],
  },
  {
    id: "runs",
    title: "Runs, history & resume",
    items: [
      {
        q: "What do I see while a run executes?",
        a: "A live sidebar: each node's status (queued, running, succeeded, failed), how long it took, and its full input and output payloads, streaming in over Realtime as the engine progresses. Generated images and audio appear inline.",
      },
      {
        q: "Where do old runs go?",
        a: "The Runs page keeps your full history, filterable by flow, status, trigger kind, time, and duration. Open any run for its complete node-by-node timeline.",
      },
      {
        q: "A node failed halfway through. Do I re-run everything?",
        a: "No — open the run and resume from the failed node. Results of the earlier nodes are reused instead of re-executed (and re-billed).",
      },
      {
        q: "Can I cancel a run?",
        a: "Yes, from the editor or the run's detail page. You can also delete runs you no longer want in your history.",
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations & your API keys",
    items: [
      {
        q: "Why bring my own API keys?",
        a: "Your flows call AI models with your own OpenAI, Google Gemini, Cloudflare, or DeepSeek credentials, so you pay provider prices directly with no middleman and no markup, and your usage isn't pooled with anyone else's.",
      },
      {
        q: "How are my keys stored?",
        a: "Encrypted at rest with AES-256-GCM. Keys are decrypted only at the moment a run needs to call the provider, and they're never returned to the browser after you save them.",
      },
      {
        q: "What does Cloudflare Workers AI need?",
        a: "Two values: your Cloudflare account ID and an API token with Workers AI access. The other providers need just an API key.",
      },
    ],
  },
  {
    id: "forms",
    title: "Public forms",
    items: [
      {
        q: "What is a public form?",
        a: "A shareable link that turns your workflow into a simple form. Fields are derived from the flow's input nodes, answers are routed to the right nodes, and submitting starts a run — no account needed for the person filling it in.",
      },
      {
        q: "Can the person who submits see the result?",
        a: "That's your choice per form. With outputs enabled, submitters land on a live result page; with them disabled, they just get a confirmation.",
      },
      {
        q: "Are there limits on forms?",
        a: "File uploads are capped at 5 MB per file, and submissions are rate limited per device and per form so a shared link can't drain your provider keys.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Data & privacy",
    items: [
      {
        q: "What data does FloowForge store about me?",
        a: (
          <>
            Your account email and profile, the flows and runs you create, any
            files you upload, encrypted provider credentials, and — for abuse
            prevention — technical signals about requests: IP address, a device
            identifier, browser and operating system, timezone, and language.
            The full picture is in the{" "}
            <Link href="/privacy" className="underline hover:text-[var(--foreground)]">
              Privacy Policy
            </Link>
            .
          </>
        ),
      },
      {
        q: "Where do generated images and audio live?",
        a: "In a private storage bucket. They're served through short-lived signed URLs, so a leaked link expires instead of exposing your media forever.",
      },
      {
        q: "Is my workflow content sent to AI providers?",
        a: "Only when your flow runs an AI node: that node's inputs go to the provider you connected (OpenAI, Google, Cloudflare, or DeepSeek) to produce the output. Nothing is sent to providers outside of your runs.",
      },
    ],
  },
  {
    id: "limits",
    title: "Rate limits",
    items: [
      {
        q: "Are there rate limits?",
        a: "Yes, but they're sized so a person never meets them: generous per-account budgets for normal use, a separate budget for starting runs, and per-device limits for anonymous visitors. Limits are per account and per device rather than per IP, so a whole dorm on one network isn't punished for one heavy user.",
      },
      {
        q: "What happens if I hit one?",
        a: "The request gets a friendly error telling you how many seconds to wait, and every API response carries RateLimit headers so clients can pace themselves. Repeated hammering escalates to a short cooldown; normal use never gets near this.",
      },
    ],
  },
  {
    id: "self-hosting",
    title: "Self-hosting",
    items: [
      {
        q: "Can I run FloowForge myself?",
        a: (
          <>
            Yes — the stack is open. You&apos;ll need your own Supabase project
            and a Redis instance; after that,{" "}
            <code className="text-xs bg-[var(--muted)] px-1.5 py-0.5 rounded">
              docker compose up --build
            </code>{" "}
            starts the web app, API, and worker in one command. The README on{" "}
            <a
              href="https://github.com/KuanKongy/FloowForge"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--foreground)]"
            >
              GitHub
            </a>{" "}
            walks through it.
          </>
        ),
      },
      {
        q: "What is the architecture?",
        a: "A Next.js web app, a FastAPI backend, a Redis Streams worker that executes runs, and Supabase for Postgres, auth, storage, and the Realtime channel that streams run progress to the canvas.",
      },
    ],
  },
];

export function FaqSection({ section }: { section: FaqSectionData }) {
  return (
    <section id={section.id} className="scroll-mt-20">
      <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
        {section.title}
      </h2>
      <div className="mt-3 flex flex-col gap-2.5">
        {section.items.map((item) => (
          <details key={item.q} className="card-surface group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown
                size={16}
                className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="pt-2.5 pb-1 text-sm text-[var(--muted-foreground)] leading-relaxed">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
