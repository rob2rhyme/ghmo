import { NextRequest } from "next/server";
import { calendarResponse } from "@/src/lib/calendarResponse";
import { getPublishedEvents } from "@/src/lib/publicData.server";

export const dynamic = "force-dynamic";

/** Public calendar feed of published events (subscribe from any calendar app). Reads the cached public loader. */
export async function GET(req: NextRequest) {
  const events = await getPublishedEvents();
  if (!events) {
    // People open this link in a browser or a calendar app, so a failure is a plain sentence, not JSON.
    return new Response("The events calendar can't be loaded right now. Try again in a few minutes.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return calendarResponse(events, req.nextUrl.origin, "ghmo-events.ics");
}
