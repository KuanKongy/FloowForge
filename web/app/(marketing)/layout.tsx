import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Shared shell for the public marketing pages (/, /faq, /contact, /terms,
 * /privacy). Routes other than "/" sit outside the middleware matcher on
 * purpose — they render for signed-in and signed-out visitors, and the header
 * adapts via a cheap cookie-presence check.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-1)] text-[var(--foreground)]">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
