import { redirect } from "next/navigation";
import { BadgeCheck, Clock3, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileSignOut } from "./ProfileSignOut";


function groupSessionStatusByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countSessionStatusByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const initial = (user.email?.trim()?.[0] ?? user.user_metadata?.full_name?.[0] ?? "?").toUpperCase();
  const displayName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email?.split("@")[0] ||
    "Account";
  const authProvider =
    (typeof user.app_metadata?.provider === "string" && user.app_metadata.provider) || "email";
  const emailVerified = Boolean(user.email_confirmed_at);
  const createdAt = user.created_at ? formatDateTime(user.created_at) : "Unknown";
  const lastSignIn = user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "No recent sign-in";

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
          Keep your account details easy to scan and your session under control.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <section className="card-surface overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(255,234,241,0.9),rgba(255,255,255,1))] px-5 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div
                className="flex size-16 shrink-0 items-center justify-center rounded-[18px] text-xl font-semibold shadow-[0_10px_30px_rgba(180,10,127,0.12)]"
                style={{
                  backgroundColor: "rgba(var(--text__background-rgb), 1)",
                  color: "rgba(var(--text__font-rgb), 1)",
                }}
                aria-hidden
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-tight">{displayName}</p>
                <p className="mt-1 break-all text-sm text-[var(--muted-foreground)]">{user.email ?? "No email"}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                  <span className="pill bg-[var(--surface-2)] text-[var(--foreground)]">
                    {authProvider === "google" ? "Google account" : "Email account"}
                  </span>
                  <span className="pill bg-[var(--secondary)] text-[var(--primary)]">
                    {emailVerified ? "Email verified" : "Email not verified"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
            <InfoTile
              icon={<Mail size={16} className="text-[var(--primary)]" />}
              label="Sign-in email"
              value={user.email ?? "No email"}
            />
            <InfoTile
              icon={<ShieldCheck size={16} className="text-[var(--primary)]" />}
              label="Sign-in method"
              value={authProvider === "google" ? "Google OAuth" : "Email and password"}
            />
            <InfoTile
              icon={<Clock3 size={16} className="text-[var(--primary)]" />}
              label="Last active"
              value={lastSignIn}
            />
            <InfoTile
              icon={<BadgeCheck size={16} className="text-[var(--primary)]" />}
              label="Member since"
              value={createdAt}
            />
          </div>
        </section>

        <div className="space-y-4">
          <section className="card-surface p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-[12px] bg-[var(--secondary)] p-2 text-[var(--primary)]">
                <UserRound size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Session controls</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Sign out of this device when you are finished working or switching accounts.
                </p>
              </div>
            </div>
            <ProfileSignOut className="mt-4 w-full" />
          </section>

          <section className="card-surface p-5">
            <h2 className="text-sm font-semibold">Account reference</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Keep this ID handy for support requests, audit trails, or debugging.
            </p>
            <code className="mt-3 block rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 text-xs leading-relaxed break-all text-[var(--foreground)]">
              {user.id}
            </code>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-1)] p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-sm font-medium leading-5 text-[var(--foreground)]">{value}</p>
    </div>
  );
}


type SessionPanelRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readSessionPanelLabel(record: SessionPanelRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortSessionPanelRecords(records: SessionPanelRecord[]): SessionPanelRecord[] {
  return records.slice().sort((a, b) => readSessionPanelLabel(a).localeCompare(readSessionPanelLabel(b)));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const sessionworkerTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveSessionWorkerTone(status: string | undefined): keyof typeof sessionworkerTone {
  if (status && status in sessionworkerTone) return status as keyof typeof sessionworkerTone;
  return 'queued';
}

