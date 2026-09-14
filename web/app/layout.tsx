import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "FloowForge",
  description: "Build, save, and trigger AI workflows with no code.",
  icons: {
    icon: "/images/flowforge.png",
    shortcut: "/images/flowforge.png",
    apple: "/images/flowforge.png",
  },
  openGraph: {
    title: "FloowForge — AI workflows you can watch running",
    description:
      "Drag AI nodes onto a canvas and wire them together. Every run streams back live — node by node, with real timings — then ships as a webhook, a schedule, or a public form.",
    type: "website",
    siteName: "FloowForge",
    images: [{ url: "/images/og.png", width: 2400, height: 1260, alt: "A FloowForge flow mid-run: a webhook trigger fans out to two AI nodes in parallel, then joins into text-to-speech" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FloowForge — AI workflows you can watch running",
    description:
      "Drag AI nodes onto a canvas and wire them together. Every run streams back live, node by node, with real timings.",
    images: ["/images/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
