import { NextRequest, NextResponse } from "next/server";
import { buildPublicCsp, buildSecureCsp, createNonce, isSecurePath } from "@/src/lib/security/csp";

// Fast checks only. Full session verification happens server-side in requireActiveAdmin.
const SESSION_COOKIES = ["__session", "sessionToken"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasSession = SESSION_COOKIES.some(name => req.cookies.has(name));
    if (!hasSession) {
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

  if (!isSecurePath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", buildPublicCsp({ upgradeInsecure }));
    return response;
  }

  const nonce = createNonce();
  const csp = buildSecureCsp({
    nonce,
    isDev,
    upgradeInsecure,
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  });

  // Next.js reads the CSP request header to stamp its own scripts with the nonce.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|assets/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
