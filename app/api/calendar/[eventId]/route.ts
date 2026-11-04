import { NextRequest } from "next/server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { calendarResponse } from "@/src/lib/calendarResponse";
import { getPublishedEvent } from "@/src/lib/publicData.server";

export const dynamic = "force-dynamic";

/** People open this link from the event page, so a failure is a plain sentence, not JSON. */
const plainText = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * One published event as an .ics file ("Add to calendar"). Reads the cached public loader. The event link uses
 * the configured site address (getAppOrigin), not the request's Host (R4 S9). Freshness: see ../route.ts (R4 P9).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const event = await getPublishedEvent(eventId);
  if (event === undefined) return plainText(503, "This event can't be added to your calendar right now. Try again in a few minutes.");
  if (!event) return plainText(404, "This event isn't on the calendar. It may have been removed, or it isn't published yet.");
  return calendarResponse([event], getAppOrigin(req), `event-${eventId.replace(/[^A-Za-z0-9_-]/g, "")}.ics`);
}
