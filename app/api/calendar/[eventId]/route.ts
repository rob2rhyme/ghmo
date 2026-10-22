import { NextRequest, NextResponse } from "next/server";
import { calendarResponse } from "@/src/lib/calendarResponse";
import { listPublishedEvents } from "@/src/lib/events";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

/** One published event as an .ics file ("Add to calendar"). */
export async function GET(req: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const event = (await listPublishedEvents()).find(item => item.id === eventId);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return calendarResponse([event], req.nextUrl.origin, `event-${eventId.replace(/[^A-Za-z0-9_-]/g, "")}.ics`);
  } catch (error) {
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
