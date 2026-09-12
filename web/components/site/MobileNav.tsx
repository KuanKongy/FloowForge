"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-8 items-center justify-center rounded-[10px] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full border-b border-[var(--border)] bg-[var(--surface-1)]/95 backdrop-blur-md shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
          >
            <div className="mx-auto max-w-6xl px-5 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                {signedIn ? (
                  <Link href="/app" onClick={() => setOpen(false)}>
                    <Button size="sm" className="w-full justify-center">
                      Open dashboard
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/auth/sign-in" onClick={() => setOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full justify-center">
                        Sign in
                      </Button>
                    </Link>
                    <Link href="/auth/sign-up" onClick={() => setOpen(false)}>
                      <Button size="sm" className="w-full justify-center">
                        Get started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
