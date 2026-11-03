//app/api/organizations/[orgSlug]/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { ensureOrgSlug, normalizeEvent, queryAllEvents } from "@/src/lib/events";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
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

    const db = getAdminDb();
    const statusConstraint =
      statusParam === "draft" || statusParam === "archived"
        ? statusParam
        : requiresAdmin && statusParam === "all"
          ? null
          : "published";

    const normalizeAndSort = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      const entries = docs.map(normalizeEvent);
      const toMillis = (value: any) => {
        if (!value) return Number.POSITIVE_INFINITY;
        const raw = typeof value === "object" && typeof value.toDate === "function" ? value.toDate() : value;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
      };
      return entries.sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
    };

    const buildQuery = (collection: FirebaseFirestore.Query, withOrderBy: boolean) => {
      let q = collection;
      if (statusConstraint) {
        q = q.where("status", "==", statusConstraint);
      }
      if (rangeStart) {
        q = q.where("startsAt", ">=", new Date(rangeStart));
      }
      if (rangeEnd) {
        q = q.where("startsAt", "<=", new Date(rangeEnd));
      }
      if (withOrderBy) {
        q = q.orderBy("startsAt", "asc");
      }
      return q.limit(200);
    };

    // Every events location, merged (see eventCollectionPaths).
    const runQueries = (withOrderBy: boolean) => queryAllEvents(db, collection => buildQuery(collection, withOrderBy));

    let events: ReturnType<typeof normalizeEvent>[] = [];
    try {
      const docs = await runQueries(true);
      events = normalizeAndSort(docs);
    } catch (err: any) {
      const message = err?.message ? String(err.message) : "Unknown error";
      const missingIndex =
        err?.code === 9 ||
        message.includes("FAILED_PRECONDITION") ||
        message.includes("requires an index");
      if (!missingIndex) {
        return NextResponse.json(
          { ok: false, error: "EVENTS_QUERY_FAILED", message },
          { status: 500 }
        );
      }
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            ok: false,
            error: "MISSING_INDEX",
            message: "Firestore composite index required for events query."
          },
          { status: 503 }
        );
      }
      const docs = await runQueries(false);
      events = normalizeAndSort(docs);
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
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("x-events-auth", authMode);
    }
    return response;
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
