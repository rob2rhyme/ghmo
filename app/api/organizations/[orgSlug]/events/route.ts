import { NextRequest, NextResponse } from "next/server";
import { assertMember } from "@/src/lib/auth";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { ensureOrgSlug, eventsCollectionPath, normalizeEvent } from "@/src/lib/events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await assertMember(req);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") || "future";
  const rangeStart = searchParams.get("rangeStart");
  const rangeEnd = searchParams.get("rangeEnd");

  const db = getAdminDb();
  let query = db.collection(eventsCollectionPath(params.orgSlug)).where("status", "==", "published");

  if (rangeStart) {
    query = query.where("startsAt", ">=", new Date(rangeStart));
  }
  if (rangeEnd) {
    query = query.where("startsAt", "<=", new Date(rangeEnd));
  }

  query = query.orderBy("startsAt", "asc");
  const snap = await query.limit(200).get();
  const fallbackSnap =
    snap.empty
    ? await db
          .collection(`community/${COMMUNITY_ID}/events`)
          .where("status", "==", "published")
          .orderBy("startsAt", "asc")
          .limit(200)
          .get()
      : null;
  const sourceDocs = snap.empty && fallbackSnap ? fallbackSnap.docs : snap.docs;
  const events = sourceDocs.map(normalizeEvent);

  const now = Date.now();
  const filtered =
    statusFilter === "all"
      ? events
      : statusFilter === "past"
        ? events.filter(evt => (evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() < now : false))
        : events.filter(evt => (evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() >= now : true));

  return NextResponse.json({ ok: true, events: filtered });
}
