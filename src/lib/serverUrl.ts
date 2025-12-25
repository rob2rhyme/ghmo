import "server-only";

import { headers } from "next/headers";

export function getBaseUrl() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) {
    const port = process.env.PORT || "3000";
    return `http://localhost:${port}`;
  }
  return `${proto}://${host}`;
}

export function internalApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBaseUrl()}${normalizedPath}`;
}
