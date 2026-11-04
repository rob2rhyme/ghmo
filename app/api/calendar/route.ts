import { NextRequest } from "next/server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { calendarResponse } from "@/src/lib/calendarResponse";
import { getPublishedEvents } from "@/src/lib/publicData.server";

export const dynamic = "force-dynamic";

/**
 * Public calendar feed of published events (subscribe from any calendar app). Reads the cached public loader.
 * Event links use the configured site address (getAppOrigin), never the request's Host: the CDN may keep this
 * answer, and a forged Host must not end up in it (R4 S9).
 *
 * Freshness (R4 P9): admin saves expire the cache at once. A change made outside the app (the Firebase console)
 * is picked up the usual way for unstable_cache: after PUBLIC_CACHE_SECONDS the next request still gets the old
 * copy and triggers a refresh, so the change shows one request later. Acceptable for a calendar feed.
 */
export async function GET(req: NextRequest) {
  const events = await getPublishedEvents();
  if (!events) {
    // People open this link in a browser or a calendar app, so a failure is a plain sentence, not JSON.
    return new Response("The events calendar can't be loaded right now. Try again in a few minutes.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return calendarResponse(events, getAppOrigin(req), "ghmo-events.ics");
}
