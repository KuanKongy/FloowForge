import path from "node:path";
import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * `connect-src` has to reach the API and Supabase (REST, Storage, and the
 * Realtime websocket), both of which are configured per-environment, so the
 * directive is built from the same public env vars the browser client uses.
 *
 * `'unsafe-inline'` on style-src is required by Next's runtime style injection
 * and by the inline `style` props the editor uses for node tinting.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  const api = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";
  const websocket = supabase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

  const connect = ["'self'", supabase, websocket, api].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts; eval is needed in dev only but
    // keeping one policy avoids a dev/prod behaviour split.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    // Generated media arrives as signed Supabase Storage URLs; data: covers the
    // base64 previews the editor still uses for uploads.
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Opt-in (set by Dockerfile.web) so `next dev` and non-container deploys are
  // untouched. The tracing root must be the repo root or the standalone bundle
  // drops @floowforge/shared, which is raw TS consumed via transpilePackages.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: ["@floowforge/shared"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
