
function pickSessionEdgeChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeSessionEdgePatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Supabase clients expect the project root (https://ref.supabase.co), not .../auth/v1 or .../rest/v1. */
export function normalizeSupabaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  const suffixes = ["/auth/v1", "/rest/v1", "/storage/v1", "/functions/v1"];
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of suffixes) {
      if (u.toLowerCase().endsWith(s.toLowerCase())) {
        u = u.slice(0, -s.length).replace(/\/+$/, "");
        changed = true;
      }
    }
  }
  return u;
}
