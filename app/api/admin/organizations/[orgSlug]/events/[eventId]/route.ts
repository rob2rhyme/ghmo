import { NextRequest, NextResponse } from "next/server";
import { assertCommunityRole } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAudit } from "@/src/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = await assertCommunityRole("admin");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, any> = {
    updatedAt: new Date()
  };
  const allowFields = [
    "title",
    "summary",
    "body",
    "status",
    "startsAt",
    "endsAt",
    "timezone",
    "location",
    "featured",
    "announcementDocTemplate",
    "announcementPdfSource"
  ];
  allowFields.forEach(key => {
    if (body[key] !== undefined) {
      if (key === "startsAt" || key === "endsAt") {
        updates[key] = body[key] ? new Date(body[key]) : null;
      } else if (key === "timezone") {
        updates[key] = body[key] || DEFAULT_TIMEZONE;
      } else {
        updates[key] = body[key];
      }
    }
  });

  const ref = adminDb.collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId);
  await ref.set(updates, { merge: true });
  const doc = await ref.get();
  await logAudit({
    communityId: COMMUNITY_ID,
    type: "event_updated",
    summary: `Updated event: ${updates.title || params.eventId}`,
    actorUid: admin.uid,
    role: admin.role,
    metadata: { eventId: params.eventId, title: updates.title, status: updates.status }
  });
  return NextResponse.json({ ok: true, event: normalizeEvent(doc) });
}

export async function DELETE(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = await assertCommunityRole("admin");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await adminDb.collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId).delete();
  await logAudit({
    communityId: COMMUNITY_ID,
    type: "event_deleted",
    summary: `Deleted event: ${params.eventId}`,
    actorUid: admin.uid,
    role: admin.role,
    metadata: { eventId: params.eventId }
  });
  return NextResponse.json({ ok: true });
}
