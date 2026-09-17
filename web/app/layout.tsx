import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import logo from "@/public/images/floowforge.png";
import logoApple from "@/public/images/floowforge-apple.png";
import logoIco from "@/public/images/floowforge.ico";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "FloowForge",
  description: "Build, save, and trigger AI workflows with no code.",
  // floowforge.png is the main logo. floowforge.ico (16/32/48 frames for tabs)
  // and floowforge-apple.png (180, full-bleed because iOS applies its own
  // rounded mask) are hand-drawn from it at each pixel size, so they do NOT
  // update on their own: redraw both whenever floowforge.png changes.
  // Imported rather than referenced by path so each URL carries a content hash,
  // and a browser never reuses a favicon cached from another app on the same
  // port.
  icons: {
    icon: [
      { url: logoIco.src, sizes: "16x16 32x32 48x48" },
      { url: logo.src, type: "image/png", sizes: "1254x1254" },
    ],
    apple: { url: logoApple.src, sizes: "180x180" },
  },
  openGraph: {
    title: "FloowForge · AI workflows you can watch running",
    description:
      "Drag AI nodes onto a canvas and wire them together. Every run streams back live, node by node with real timings, then ships as a webhook, a schedule, or a public form.",
    type: "website",
    siteName: "FloowForge",
    images: [{ url: "/images/og.png", width: 2400, height: 1260, alt: "A FloowForge flow mid-run: a webhook trigger fans out to two AI nodes in parallel, then joins into text-to-speech" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FloowForge · AI workflows you can watch running",
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
