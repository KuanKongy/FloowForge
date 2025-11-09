"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


type SessionPanelRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readSessionPanelLabel(record: SessionPanelRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortSessionPanelRecords(records: SessionPanelRecord[]): SessionPanelRecord[] {
  return records.slice().sort((a, b) => readSessionPanelLabel(a).localeCompare(readSessionPanelLabel(b)));
}

export function ProfileSignOut({ className }: { className?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={signOut} className={className}>
      Sign out
    </Button>
  );
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


function buildSessionLayoutSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterSessionLayoutRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildSessionLayoutSearchText(record).includes(needle));
}

