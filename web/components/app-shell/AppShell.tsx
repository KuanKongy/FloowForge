"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  CalendarClock,
  CircleUserRound,
  KeyRound,
  LogOut,
  PlayCircle,
  Sparkles,
  Workflow,
} from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/app/flows", label: "Flows", icon: Workflow },
  { href: "/app/runs", label: "Runs", icon: PlayCircle },
  { href: "/app/triggers", label: "Triggers", icon: CalendarClock },
  { href: "/app/custom-nodes", label: "Custom Nodes", icon: Boxes },
  { href: "/app/integrations", label: "Integrations", icon: KeyRound },
];

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  const isEditor = /\/app\/flows\/[^/]+$/.test(pathname);

  if (isEditor) {
    // The editor is a chrome-less full-canvas page; it draws its own top bar.
    return <div className="h-screen w-screen overflow-hidden">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)] text-[var(--foreground)] flex">
      <aside className="w-[230px] border-r border-[var(--border)] bg-[var(--surface-2)] flex flex-col">
        <Link href="/app" className="px-5 py-5 font-semibold text-[1.05rem]">
          <BrandWordmark />
        </Link>
        <nav className="flex-1 px-2 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={`flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--secondary)] text-[var(--primary)]"
                    : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <Icon size={18} strokeWidth={1.7} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <Link
              href="/app/profile"
              prefetch
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-2 text-sm font-medium transition-colors ${
                pathname === "/app/profile"
                  ? "bg-[var(--secondary)] text-[var(--primary)]"
                  : "text-[var(--foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              <CircleUserRound size={18} strokeWidth={1.7} className="shrink-0 text-[var(--muted-foreground)]" />
              <span className="truncate">{userEmail}</span>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="shrink-0 rounded-[10px] p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={16} strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <TopBar pathname={pathname} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  const seg = pathname.split("/").filter(Boolean);
  const label = seg[1]
    ? seg[1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
    : "FlowForge";

  return (
    <header className="flex h-[56px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-6">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles size={16} className="text-[var(--primary)]" />
        <span className="text-[var(--muted-foreground)]">
          <BrandWordmark />
          {" /"}
        </span>
        <span className="font-medium">{label}</span>
      </div>
    </header>
  );
}
