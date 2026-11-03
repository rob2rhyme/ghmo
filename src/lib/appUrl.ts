import type { NextRequest } from "next/server";

/**
 * The public origin used in links we email or show to people (magic links, signing links, broadcasts,
 * unsubscribe, notifications). Always the configured NEXT_PUBLIC_APP_URL, so a forged Host header can never
 * change where a link points (plan S-07). In production an unset address is an error rather than a guess;
 * locally (and in the emulator test build) the request's own origin is used.
 */
export function getAppOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the checks below
    }
  }
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set before links can be sent");
  }
  return req.nextUrl.origin;
}
