import type { NextRequest } from "next/server";

let warned = false;

/**
 * The public origin used in links we email or show to people (magic links,
 * signing links). Prefers the configured NEXT_PUBLIC_APP_URL so a forged Host
 * header cannot change where links point (plan S-07).
 */
export function getAppOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("NEXT_PUBLIC_APP_URL is not set; falling back to the request origin for links.");
  }
  return req.nextUrl.origin;
}
