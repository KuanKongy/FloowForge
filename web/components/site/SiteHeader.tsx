import Link from "next/link";
import { cookies } from "next/headers";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Button } from "@/components/ui/button";
import { supabaseStorageKey } from "@/lib/supabase/storage-key";
import { MobileNav } from "./MobileNav";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Shared marketing header: logo left, section nav centered, theme toggle and
 * auth CTA right (OnboardBuddy-style layout).
 *
 * Auth awareness is a cookie-*presence* check only — no Supabase round trip.
 * Marketing routes outside the middleware matcher (/faq, /contact, /terms,
 * /privacy) render for signed-in and signed-out visitors alike; a stale
 * cookie merely shows "Open dashboard", and /app's own guard sorts it out.
 */
export async function SiteHeader() {
  const storageKey = supabaseStorageKey();
  const jar = await cookies();
  const signedIn =
    storageKey !== null &&
    jar.getAll().some((cookie) => cookie.name === storageKey || cookie.name.startsWith(`${storageKey}.`));

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[var(--surface-1)]/80 border-b border-[var(--border)]">
      <div className="relative mx-auto max-w-6xl flex items-center justify-between px-5 sm:px-8 py-3.5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[1.05rem]">
          <BrandWordmark />
        </Link>

        <nav
          className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1"
          aria-label="Main"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[10px] px-2.5 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/app" className="hidden md:block">
              <Button size="sm">Open dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/auth/sign-in" className="hidden md:block">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/auth/sign-up" className="hidden md:block">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
          <MobileNav signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}
