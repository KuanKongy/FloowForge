import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";

const FOOTER_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 flex flex-col items-center gap-4 sm:grid sm:grid-cols-3">
        <BrandWordmark className="sm:justify-self-start" />
        <p className="text-xs text-[var(--muted-foreground)] text-center">
          No-code AI workflows you can watch running.
        </p>
        <nav
          className="flex items-center gap-4 text-sm sm:justify-self-end"
          aria-label="Legal"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-[var(--muted-foreground)]">
        © 2026 FloowForge. All rights reserved.
      </p>
    </footer>
  );
}
