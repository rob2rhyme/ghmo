import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { ensureOrgSlug } from "@/src/lib/events";
import { eventsCollectionPath } from "@/src/lib/events";
import { COMMUNITY_ID } from "@/src/lib/community";
import { orgMinutesCollectionPath } from "@/src/lib/firestorePaths";
import { publicView } from "@/src/lib/minutesRecords";
import { toPlain } from "@/src/lib/serialize.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

async function findEventDoc(orgSlug: string, eventId: string) {
  const db = getAdminDb();
  const slugRef = db.collection(eventsCollectionPath(orgSlug)).doc(eventId);
  const slugSnap = await slugRef.get();
  if (slugSnap.exists) return slugSnap;
  const fallbackRef = db.collection(`community/${COMMUNITY_ID}/events`).doc(eventId);
  const fallbackSnap = await fallbackRef.get();
  if (fallbackSnap.exists) return fallbackSnap;
  return null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
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

    const eventSnap = await findEventDoc(params.orgSlug, params.eventId);
    if (!eventSnap) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const eventData = eventSnap.data() || {};
    if (eventData.status !== "published") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const db = getAdminDb();
    const minutesSnap = await db
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
    return NextResponse.json({ ok: true, minutes: toPlain(publicView({ id: doc.id, ...data })) });
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
