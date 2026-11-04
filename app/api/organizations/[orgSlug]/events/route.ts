//app/api/organizations/[orgSlug]/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { EventsIndexMissingError, ensureOrgSlug, queryEvents, toPublicEvent } from "@/src/lib/events";
import type { EventRecord } from "@/src/lib/events.shared";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";

/**
 * The public list (published events) may be served by the CDN for one minute. The CDN copy can't be expired
 * when an admin unpublishes an event, so it is kept short and never served stale. next.config.mjs leaves this
 * path out of its blanket no-store, so the admin variants (status=all/draft/archived) set no-store here.
 */
const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=60";

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") || "";
    const requiresAdmin = statusParam === "all" || statusParam === "draft" || statusParam === "archived";
    const rangeStart = searchParams.get("rangeStart");
    const rangeEnd = searchParams.get("rangeEnd");
    let authMode: "public" | "admin" = "public";

    if (requiresAdmin) {
      const guard = await enforceActiveAdmin(req, params.orgSlug);
      if ("response" in guard) return guard.response;
      authMode = "admin";
    }

    const statusConstraint =
      statusParam === "draft" || statusParam === "archived"
        ? statusParam
        : requiresAdmin && statusParam === "all"
          ? null
          : "published";

    let events: EventRecord[] = [];
    try {
      events = await queryEvents({ status: statusConstraint, rangeStart, rangeEnd });
    } catch (err) {
      if (err instanceof EventsIndexMissingError) {
        return NextResponse.json({ ok: false, error: "MISSING_INDEX", message: err.message }, { status: 503 });
      }
      console.error("Events query failed", err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: "EVENTS_QUERY_FAILED" }, { status: 500 });
    }

    const now = Date.now();
    const timeFilter =
      statusParam === "future" ? "future" : statusParam === "past" ? "past" : "all";
    const filtered =
      timeFilter === "all"
        ? events
        : timeFilter === "past"
          ? events.filter(evt => (evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() < now : false))
          : events.filter(evt => (evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() >= now : true));

    // Firestore timestamps become epoch milliseconds; raw Timestamp objects reach the browser as
    // {_seconds, _nanoseconds}, which `new Date()` cannot read ("Invalid Date", and no upcoming events).
    const shaped = authMode === "public" ? filtered.map(toPublicEvent) : filtered;
    const response = NextResponse.json({ ok: true, events: shaped.map(evt => toPlain(evt)) });
    response.headers.set("Cache-Control", authMode === "public" ? PUBLIC_API_CACHE_CONTROL : "no-store");
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("x-events-auth", authMode);
    }
    return response;
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    throw error;
  }
}
