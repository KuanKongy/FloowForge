import type { Metadata } from "next";
import { ArrowUpRight, Github, Linkedin, Mail } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

export const metadata: Metadata = {
  title: "Contact · FloowForge",
  description: "Get in touch about FloowForge — bugs, ideas, or collaboration.",
};

const CONTACTS = [
  {
    icon: <Github size={20} />,
    title: "GitHub",
    body: "Follow development, browse the source, open an issue, or contribute.",
    cta: "View on GitHub",
    href: "https://github.com/KuanKongy/FloowForge",
  },
  {
    icon: <Linkedin size={20} />,
    title: "LinkedIn",
    body: "Connect with Nam and follow the person behind the project.",
    cta: "Connect on LinkedIn",
    href: "https://www.linkedin.com/in/kuankongy/",
  },
  {
    icon: <Mail size={20} />,
    title: "Email",
    body: "For anything that doesn't fit GitHub: questions, feedback, or collaboration.",
    cta: "Send an email",
    href: "mailto:khanhpronam@gmail.com",
  },
] as const;

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
      <Reveal onMount className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Get in touch</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Found a bug, have an idea, or want to talk about FloowForge?
        </p>
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
        {CONTACTS.map((contact, i) => (
          // onMount: this page is short enough that the cards are above the
          // fold — whileInView can miss content already visible on load.
          <Reveal key={contact.title} onMount delay={0.08 + i * 0.06}>
            <a
              href={contact.href}
              target={contact.href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="card-surface block p-6 h-full"
            >
              <span className="inline-flex items-center justify-center rounded-[10px] p-2.5 bg-[var(--secondary)] text-[var(--primary)]">
                {contact.icon}
              </span>
              <h2 className="font-semibold mt-4">{contact.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{contact.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)]">
                {contact.cta} <ArrowUpRight size={14} />
              </span>
            </a>
          </Reveal>
        ))}
      </div>

      <Reveal onMount delay={0.3} className="mt-14 text-center">
        <p className="text-sm font-medium">FloowForge</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          An independent project maintained by Nam Le.
        </p>
      </Reveal>
    </main>
  );
}
