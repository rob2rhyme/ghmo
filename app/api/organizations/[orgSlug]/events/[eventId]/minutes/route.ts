import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { ensureOrgSlug } from "@/src/lib/events";
import { eventsCollectionPath } from "@/src/lib/events";
import { COMMUNITY_ID } from "@/src/lib/community";
import { orgMinutesCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";

async function findEventDoc(orgSlug: string, eventId: string) {
  const slugRef = adminDb.collection(eventsCollectionPath(orgSlug)).doc(eventId);
  const slugSnap = await slugRef.get();
  if (slugSnap.exists) return slugSnap;
  const fallbackRef = adminDb.collection(`community/${COMMUNITY_ID}/events`).doc(eventId);
  const fallbackSnap = await fallbackRef.get();
  if (fallbackSnap.exists) return fallbackSnap;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eventSnap = await findEventDoc(params.orgSlug, params.eventId);
  if (!eventSnap) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eventData = eventSnap.data() || {};
  if (eventData.status !== "published") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const minutesSnap = await adminDb
    .collection(orgMinutesCollectionPath(params.orgSlug))
    .where("eventId", "==", params.eventId)
    .limit(1)
    .get();

  if (minutesSnap.empty) {
    return NextResponse.json({ ok: true, minutes: null });
  }

  const doc = minutesSnap.docs[0];
  const data = doc.data() as Record<string, any>;
  if (data.status !== "approved") {
    return NextResponse.json({ ok: true, minutes: null });
  }
  return NextResponse.json({ ok: true, minutes: toPlain({ id: doc.id, ...data }) });
}
