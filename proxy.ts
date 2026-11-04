import { NextRequest, NextResponse } from "next/server";
import { buildSecureCsp, createNonce } from "@/src/lib/security/csp";

// Runs only on the secure prefixes (see `config` below): public pages get a fixed CSP header from
// next.config.mjs, so cached pages are served without a function run. Fast checks only here; full session
// verification happens server-side in requireActiveAdmin.
const SESSION_COOKIE = "__session";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!req.cookies.has(SESSION_COOKIE)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  const isDev = process.env.NODE_ENV === "development";
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const upgradeInsecure = !isDev && (forwardedProto === "https" || req.nextUrl.protocol === "https:");

  const nonce = createNonce();
  const csp = buildSecureCsp({
    nonce,
    isDev,
    upgradeInsecure,
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    allowEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
  });

  // Next.js reads the CSP request header to stamp its own scripts with the nonce.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Lets the admin layout send people back here after signing in.
  requestHeaders.set("x-pathname", `${pathname}${search}`);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// The secure prefixes (SECURE_PREFIXES in src/lib/security/csp.ts). Prefetch requests are left alone.
// Next reads this config at build time without running the file, so every value must be written out in full
// (no shared constants). Prefetches skip the proxy: the page itself checks the session.
export const config = {
  matcher: [
    {
      source: "/admin",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    },
    {
      source: "/admin/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    },
    {
      source: "/login",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    },
    {
      source: "/sign/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    },
    {
      source: "/unsubscribe",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
