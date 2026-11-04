import "server-only";
import { NextResponse } from "next/server";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "./auth";
import { getAdminAuth } from "./firebaseAdmin";

/** Admin and member sessions last 8 hours, then a fresh magic-link sign-in is needed. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * A readable "someone is signed in here" flag with no secret in it. Page scripts check it before asking
 * /api/auth/me, so visitors (most traffic) never cost that function run. The real session stays the
 * httpOnly cookie, checked on the server.
 */
export const SIGNED_IN_HINT_COOKIE = "ghmo_signed_in";

export function hintCookieOptions(maxAge: number) {
  return { ...cookieOptions(maxAge), httpOnly: false };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Always Secure in production, regardless of proxy headers (S-09).
    secure: process.env.NODE_ENV === "production",
    // Lax keeps the cookie off cross-site POSTs (CSRF) while still allowing
    // admins to open /admin links from email.
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

/** A session cookie is only minted from a sign-in this recent (Firebase's own recommendation). */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

/**
 * Exchanges a fresh Firebase ID token (signed in within the last 5 minutes) for a
 * revocable Firebase session cookie and attaches it to a JSON response. An older token is refused:
 * otherwise a browser's long-lived Firebase sign-in could keep renewing an 8-hour session.
 */
export async function createSessionResponse(idToken: string, payload: Record<string, unknown> = { ok: true }) {
  let authTime: number;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    // The browser's Firestore token carries `sessionExp`; it must never become (or extend) a session.
    if ((decoded as { sessionExp?: unknown }).sessionExp !== undefined) {
      return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    }
    authTime = decoded.auth_time;
  } catch {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }
  if (Date.now() / 1000 - authTime > MAX_SIGN_IN_AGE_SECONDS) {
    return NextResponse.json({ error: "Sign in again to continue.", code: "STALE_SIGN_IN" }, { status: 401 });
  }
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000
  });
  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions(SESSION_MAX_AGE_SECONDS));
  response.cookies.set(SIGNED_IN_HINT_COOKIE, "1", hintCookieOptions(SESSION_MAX_AGE_SECONDS));
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", cookieOptions(0));
  return response;
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
  response.cookies.set(SIGNED_IN_HINT_COOKIE, "", hintCookieOptions(0));
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", cookieOptions(0));
  return response;
}
