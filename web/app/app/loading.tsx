import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-[var(--muted-foreground)]">
      <Loader2 size={18} className="animate-spin" />
      <span className="ml-2 text-sm">Loading…</span>
    </div>
  );
}
