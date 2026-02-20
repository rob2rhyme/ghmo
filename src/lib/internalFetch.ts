import "server-only";

import { cookies, headers } from "next/headers";
import { internalApiUrl } from "./serverUrl";

export async function internalFetch(path: string, init: RequestInit = {}) {
  const url = await internalApiUrl(path);
  const cookieHeader = (await cookies()).toString();
  const incomingHeaders = await headers();

  const mergedHeaders = new Headers(init.headers || undefined);
  if (cookieHeader && !mergedHeaders.has("cookie")) mergedHeaders.set("cookie", cookieHeader);
  const userAgent = incomingHeaders.get("user-agent");
  if (userAgent && !mergedHeaders.has("user-agent")) mergedHeaders.set("user-agent", userAgent);

  return fetch(url, {
    ...init,
    cache: init.cache ?? "no-store",
    headers: mergedHeaders
  });
}
