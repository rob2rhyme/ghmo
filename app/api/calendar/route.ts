import { NextRequest, NextResponse } from "next/server";
import { calendarResponse } from "@/src/lib/calendarResponse";
import { listPublishedEvents } from "@/src/lib/events";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

/** Public calendar feed of published events (subscribe from any calendar app). */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const events = await listPublishedEvents();
    return calendarResponse(events, req.nextUrl.origin, "ghmo-events.ics");
  } catch (error) {
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
