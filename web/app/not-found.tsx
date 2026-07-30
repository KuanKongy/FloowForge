import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/BrandWordmark";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--surface-1)]">
      <BrandWordmark />
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">404</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">
        We couldn&apos;t find that page.
      </p>
      <Link href="/app" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </main>
  );
}
