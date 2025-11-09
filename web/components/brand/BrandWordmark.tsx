import { cn } from "@/lib/utils";


function groupBrandwordmarkBrowserByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countBrandwordmarkBrowserByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function BrandWordmark({
  className,
  flowClassName,
  forgeClassName,
}: {
  className?: string;
  flowClassName?: string;
  forgeClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline leading-none", className)}>
      <span className={cn("text-[var(--primary)]", flowClassName)}>Flow</span>
      <span className={forgeClassName}>Forge</span>
    </span>
  );
}

function pickBrandwordmarkTokenChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed[key] = value;
  }
  return changed;
}

function mergeBrandwordmarkTokenPatch(record: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

