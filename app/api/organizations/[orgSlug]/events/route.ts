//app/api/organizations/[orgSlug]/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { EventsIndexMissingError, ensureOrgSlug, queryEvents } from "@/src/lib/events";
import type { EventRecord } from "@/src/lib/events.shared";
import { getPublishedEvents } from "@/src/lib/publicData.server";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { toPlain } from "@/src/lib/serialize.server";
import { parseEventRange, startsInRange } from "./eventRange";

export const dynamic = "force-dynamic";

/**
 * The public list (published events) may be served by the CDN for one minute. The CDN copy can't be expired
 * when an admin unpublishes an event, so it is kept short and never served stale. next.config.mjs leaves this
 * path out of its blanket no-store, so the admin variants (status=all/draft/archived) set no-store here.
 */
const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=60";

/**
 * Events as JSON. No public page reads this (they use the cached loader directly); admin screens call it with
 * status=all. The public variant (published events) is served from that same cached loader,
 * getPublishedEvents, filtered here by range; the admin variants (status=all/draft/archived) query Firestore as
 * before. rangeStart/rangeEnd must be readable dates: anything else is a 400, not a failed query (R4 P10).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") || "";
    const requiresAdmin = statusParam === "all" || statusParam === "draft" || statusParam === "archived";
    const parsedRange = parseEventRange(searchParams);
    if (!parsedRange.ok) return NextResponse.json({ ok: false, error: "BAD_RANGE", message: parsedRange.error }, { status: 400 });
    const { range, rangeStart, rangeEnd } = parsedRange;
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
    if (authMode === "public") {
      // Already public-shaped (toPublicEvent), dates as epoch milliseconds; null when the read failed.
      const published = await getPublishedEvents();
      if (!published) return NextResponse.json({ ok: false, error: "EVENTS_QUERY_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
      events = published.filter(evt => startsInRange(evt, range));
    } else {
      try {
        events = await queryEvents({ status: statusConstraint, rangeStart, rangeEnd });
      } catch (err) {
        if (err instanceof EventsIndexMissingError) {
          return NextResponse.json({ ok: false, error: "MISSING_INDEX", message: err.message }, { status: 503 });
        }
        console.error("Events query failed", err instanceof Error ? err.message : String(err));
        return NextResponse.json({ ok: false, error: "EVENTS_QUERY_FAILED" }, { status: 500 });
      }
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
    const response = NextResponse.json({ ok: true, events: filtered.map(evt => toPlain(evt)) });
    response.headers.set("Cache-Control", authMode === "public" ? PUBLIC_API_CACHE_CONTROL : "no-store");
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("x-events-auth", authMode);
    }
    return response;
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}
