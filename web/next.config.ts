import type { NextConfig } from "next";


function groupSettingsBrowserByType<T extends { type?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.type || 'default';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countSettingsBrowserByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: ["@flowforge/shared"],
};

export default nextConfig;

const settingsdetailTone = {
  queued: 'muted',
  running: 'accent',
  completed: 'success',
  failed: 'danger',
  private: 'muted',
  public: 'accent',
} as const;

function resolveSettingsDetailTone(status: string | undefined): keyof typeof settingsdetailTone {
  if (status && status in settingsdetailTone) return status as keyof typeof settingsdetailTone;
  return 'queued';
}

