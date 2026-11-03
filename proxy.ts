import { NextRequest, NextResponse } from "next/server";
import { buildPublicCsp, buildSecureCsp, createNonce, isSecurePath } from "@/src/lib/security/csp";

// Fast checks only. Full session verification happens server-side in requireActiveAdmin.
const SESSION_COOKIE = "__session";
// Readable "signed in" flag (see src/lib/sessionCookies.ts). Sessions made before it existed get it here, so
// the header still asks /api/auth/me for them; visitors without a session never send that request.
const SIGNED_IN_HINT = "ghmo_signed_in";
const HINT_MAX_AGE_SECONDS = 8 * 60 * 60;

function withSignedInHint(req: NextRequest, response: NextResponse): NextResponse {
  if (req.cookies.has(SESSION_COOKIE) && !req.cookies.has(SIGNED_IN_HINT)) {
    response.cookies.set(SIGNED_IN_HINT, "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: HINT_MAX_AGE_SECONDS
    });
  }
  return response;
}

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

  if (!isSecurePath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", buildPublicCsp({ upgradeInsecure }));
    return withSignedInHint(req, response);
  }

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
  return withSignedInHint(req, response);
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
