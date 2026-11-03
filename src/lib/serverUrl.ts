import "server-only";

import { headers } from "next/headers";

/**
 * Origin for server-side calls to our own API. The configured public address comes first, so a spoofed
 * Host header can never redirect a call that carries the visitor's session cookie. In production an
 * unset address is an error; in development and tests the local server is used.
 */
export async function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the checks below
    }
  }
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set for server-side API calls");
  }
  const h = await headers();
  const host = h.get("host");
  const port = process.env.PORT || "3000";
  return host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `http://localhost:${port}`;
}

export async function internalApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${await getBaseUrl()}${normalizedPath}`;
}
