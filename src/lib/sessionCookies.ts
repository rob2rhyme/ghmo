import "server-only";
import { NextResponse } from "next/server";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "./auth";
import { getAdminAuth } from "./firebaseAdmin";

/** Admin and member sessions last 8 hours, then a fresh magic-link sign-in is needed. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

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

/**
 * Exchanges a fresh Firebase ID token (signed in within the last 5 minutes) for a
 * revocable Firebase session cookie and attaches it to a JSON response.
 */
export async function createSessionResponse(idToken: string, payload: Record<string, unknown> = { ok: true }) {
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000
  });
  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions(SESSION_MAX_AGE_SECONDS));
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", cookieOptions(0));
  return response;
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", cookieOptions(0));
  return response;
}
