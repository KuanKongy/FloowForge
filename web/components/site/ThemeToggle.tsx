"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is unknown until the client mounts; rendering a fixed icon
  // before then would mismatch the server HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={mounted ? `Switch to ${dark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex size-8 items-center justify-center rounded-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
    >
      {mounted && dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
