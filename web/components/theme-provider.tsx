"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";


type ProviderTriggerRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readProviderTriggerLabel(record: ProviderTriggerRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortProviderTriggerRecords(records: ProviderTriggerRecord[]): ProviderTriggerRecord[] {
  return records.slice().sort((a, b) => readProviderTriggerLabel(a).localeCompare(readProviderTriggerLabel(b)));
}

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
