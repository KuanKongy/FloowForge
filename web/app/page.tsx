import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Button } from "@/components/ui/button";
import { Workflow, Webhook, CalendarClock, Boxes, Zap, BotMessageSquare } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-1)] text-[var(--foreground)]">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[1.05rem]">
          <BrandWordmark />
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/auth/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
          AI workflows that <span className="text-[var(--primary)]">forge</span> themselves.
        </h1>
        <p className="mt-6 text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
          Drag-and-drop AI nodes, save flows to your account, expose them via webhooks or schedules,
          and compose larger pipelines with subflows and your own custom prompt-template nodes.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href="/auth/sign-up">
            <Button size="lg">Start building</Button>
          </Link>
          <Link href="/auth/sign-in">
            <Button variant="outline" size="lg">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-8 pb-24 grid gap-5 md:grid-cols-3">
        <Feature
          icon={<Workflow size={22} />}
          title="Visual workflow editor"
          body="Drag nodes onto a canvas, wire them up, and run. Powered by React Flow with four-direction handles and proximity reveal."
          tone="text"
        />
        <Feature
          icon={<Webhook size={22} />}
          title="Triggers"
          body="Run flows manually, on a schedule, or via public webhook URLs that you can drop into any system."
          tone="audio"
        />
        <Feature
          icon={<Boxes size={22} />}
          title="Subflows & custom nodes"
          body="Reuse a flow as a single node, or build prompt-template nodes with typed inputs and outputs."
          tone="image"
        />
        <Feature
          icon={<Zap size={22} />}
          title="Live runs"
          body="Watch each node light up in real time as runs stream events back to the canvas."
          tone="text"
        />
        <Feature
          icon={<CalendarClock size={22} />}
          title="Scheduled jobs"
          body="Cron-style triggers that fire flows on your timetable, fully managed in your dashboard."
          tone="file"
        />
        <Feature
          icon={<BotMessageSquare size={22} />}
          title="Multi-provider"
          body="OpenAI, Google Gemini, and Cloudflare Workers AI behind a single canvas."
          tone="audio"
        />
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "text" | "image" | "audio" | "file";
}) {
  return (
    <div className="card-surface p-6">
      <div
        className="inline-flex items-center justify-center rounded-[10px] p-2 mb-4"
        style={{
          backgroundColor: `rgba(var(--${tone}__background-rgb), 1)`,
          color: `rgba(var(--${tone}__font-rgb), 1)`,
        }}
      >
        {icon}
      </div>
      <h3 className="font-semibold text-[1rem]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{body}</p>
    </div>
  );
}
