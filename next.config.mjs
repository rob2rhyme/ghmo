/** @type {import('next').NextConfig} */

// Headers for every response. The Content-Security-Policy is set per request in proxy.ts.
const baseSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" }
];

/**
 * Public, read-only API answers that browsers and the CDN may keep for a few minutes. Each of these routes
 * sets its own Cache-Control (see PUBLIC_API_CACHE_CONTROL in the route); every other /api path is never
 * cached. Patterns are matched against the path after "/api/".
 */
const publicApiPaths = [
  "calendar(?:/[^/]+)?",
  "media/youtube",
  "organizations/ghmo/events",
  "organizations/ghmo/events/[^/]+/announcement\\.pdf",
  "organizations/ghmo/donations/stats"
];

/**
 * The public pages' Content-Security-Policy, as a fixed header so cached pages are served without a function run
 * (proxy.ts only runs on the secure prefixes, where it sets a per-request nonce policy). Keep in step with
 * buildPublicCsp and SECURE_PREFIXES in src/lib/security/csp.ts; tests/unit/csp.test.ts checks both.
 */
const SECURE_PREFIXES = ["admin", "login", "sign", "unsubscribe"];
const isDev = process.env.NODE_ENV === "development";
const PUBLIC_CSP = [
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");
const publicPageSource = `/:path((?!(?:${SECURE_PREFIXES.join("|")}|api|_next)(?:/|$)).*)`;

const nextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  // Home and Donate ask for quality 60; Next serves only the qualities listed here.
  images: { qualities: [60, 75] },
  // Cached public pages (Home, Donate, Minutes, Events) refresh every 5 minutes in the background. Without a
  // limit, the first visitor after a quiet weekend would be served a days-old copy (a past event as "next")
  // while the new one builds; after an hour the old copy is no longer served at all.
  expireTime: 3600,
  experimental: {
    // Needed because the app has several root layouts (public vs. secure areas).
    globalNotFound: true
  },
  async redirects() {
    // The public story of the Gumba Project lives on the Donate page; board members use /admin/gumba-project.
    return [{ source: "/gumba-project", destination: "/donate", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      { source: publicPageSource, headers: [{ key: "Content-Security-Policy", value: PUBLIC_CSP }] },
      // Behind HTTPS (Vercel), also upgrade any http: subresource; local http test servers don't send this header.
      {
        source: publicPageSource,
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Content-Security-Policy", value: `${PUBLIC_CSP}; upgrade-insecure-requests` }]
      },
      // Signing links carry a secret token in the URL: never leak it via Referer.
      { source: "/sign/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: `/api/:path((?!(?:${publicApiPaths.join("|")})$).*)`, headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The service worker must always be re-checked so fixes reach installed apps quickly.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] }
    ];
  }
};

export { PUBLIC_CSP, SECURE_PREFIXES as PUBLIC_CSP_SECURE_PREFIXES, publicPageSource };
export default nextConfig;
