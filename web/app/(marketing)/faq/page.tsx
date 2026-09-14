import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/landing/Reveal";
import { FAQ_SECTIONS, FaqSection } from "@/components/faq/FaqSections";

export const metadata: Metadata = {
  title: "FAQ · FloowForge",
  description:
    "Everything about FloowForge: the canvas, nodes, triggers, runs, integrations, public forms, privacy, and self-hosting.",
};

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 sm:px-8 py-16 sm:py-24">
      <Reveal onMount className="text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          Every part of FloowForge, explained. Missing something?{" "}
          <Link href="/contact" className="underline hover:text-[var(--foreground)]">
            Ask us directly
          </Link>
          .
        </p>
      </Reveal>

      <div className="mt-12 flex flex-col gap-10">
        {FAQ_SECTIONS.map((section, i) => (
          <Reveal key={section.id} delay={Math.min(i * 0.04, 0.2)}>
            <FaqSection section={section} />
          </Reveal>
        ))}
      </div>
    </main>
  );
}
