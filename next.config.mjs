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
const publicApiPaths = ["calendar(?:/[^/]+)?", "media/youtube", "organizations/ghmo/events", "organizations/ghmo/donations/stats"];

const nextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  experimental: {
    // Needed because the app has several root layouts (public vs. secure areas).
    globalNotFound: true
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      // Signing links carry a secret token in the URL: never leak it via Referer.
      { source: "/sign/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: `/api/:path((?!(?:${publicApiPaths.join("|")})$).*)`, headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The service worker must always be re-checked so fixes reach installed apps quickly.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] }
    ];
  }
};

export default nextConfig;
