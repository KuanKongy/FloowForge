import type { ReactNode } from "react";

/**
 * Shared typographic shell for /terms and /privacy: centered prose column,
 * H1 + "Last updated" line, numbered sections.
 */
export function LegalArticle({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 sm:px-8 py-16 sm:py-24">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
        Last updated: {lastUpdated}
      </p>
      {intro && (
        <div className="mt-6 text-[0.95rem] leading-relaxed text-[var(--muted-foreground)]">
          {intro}
        </div>
      )}
      <div className="mt-8 flex flex-col gap-8">{children}</div>
    </main>
  );
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">
        {number}. {title}
      </h2>
      <div className="mt-2.5 flex flex-col gap-3 text-[0.95rem] leading-relaxed text-[var(--muted-foreground)] [&_a]:underline [&_a:hover]:text-[var(--foreground)] [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}
