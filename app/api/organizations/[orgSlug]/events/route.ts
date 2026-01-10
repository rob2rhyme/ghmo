//app/api/organizations/[orgSlug]/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { ensureOrgSlug, eventsCollectionPath, normalizeEvent } from "@/src/lib/events";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
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

  const buildQuery = (path: string, withOrderBy: boolean) => {
    let q: FirebaseFirestore.Query = db.collection(path);
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

  const runQueries = async (withOrderBy: boolean) => {
    const primarySnap = await buildQuery(eventsCollectionPath(params.orgSlug), withOrderBy).get();
    if (!primarySnap.empty) return primarySnap.docs;
    if (COMMUNITY_ID !== params.orgSlug) {
      const orgIdSnap = await buildQuery(eventsCollectionPath(COMMUNITY_ID), withOrderBy).get();
      if (!orgIdSnap.empty) return orgIdSnap.docs;
    }
    const legacySnap = await buildQuery(`community/${COMMUNITY_ID}/events`, withOrderBy).get();
    return legacySnap.docs;
  };

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

  const response = NextResponse.json({ ok: true, events: filtered });
  if (process.env.NODE_ENV !== "production") {
    response.headers.set("x-events-auth", authMode);
  }
  return response;
}
