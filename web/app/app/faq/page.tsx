import type { Metadata } from "next";
import Link from "next/link";
import { FAQ_SECTIONS, FaqSection } from "@/components/faq/FaqSections";

export const metadata: Metadata = {
  title: "FAQ · FloowForge",
};

/** The same FAQ as the public /faq page, framed like the other dashboard pages. */
export default function AppFaqPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">FAQ</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-2xl">
          Every part of FloowForge, explained. Missing something?{" "}
          <Link href="/contact" className="underline hover:text-[var(--foreground)]">
            Ask us directly
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {FAQ_SECTIONS.map((section) => (
          <FaqSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
