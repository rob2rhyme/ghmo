import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";
import { logAudit } from "@/src/lib/audit";

async function resolveTimelineDoc(orgSlug: string, entryId: string) {
  const primaryRef = adminDb.collection(orgTimelineCollectionPath(orgSlug)).doc(entryId);
  const primarySnap = await primaryRef.get();
  if (primarySnap.exists) return { ref: primaryRef, snap: primarySnap };

  const legacyRef = adminDb.collection(`community/${COMMUNITY_ID}/timeline`).doc(entryId);
  const legacySnap = await legacyRef.get();
  if (legacySnap.exists) return { ref: legacyRef, snap: legacySnap };

  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { orgSlug: string; entryId: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json()) as { title?: string; body?: string; tags?: string[] };
  if (payload.title !== undefined && !payload.title.trim()) {
    return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
  }
  if (payload.body !== undefined && typeof payload.body !== "string") {
    return NextResponse.json({ error: "Body must be a string" }, { status: 400 });
  }

  const docResult = await resolveTimelineDoc(params.orgSlug, params.entryId);
  if (!docResult) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, any> = { updatedAt: new Date() };
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.body !== undefined) update.body = payload.body;
  if (Array.isArray(payload.tags)) update.tags = payload.tags;

  await docResult.ref.set(update, { merge: true });
  const updatedSnap = await docResult.ref.get();
  const updated = updatedSnap.data() || {};

  await logAudit({
    communityId: auth.communityId,
    type: "timeline_updated",
    summary: `Updated timeline entry: ${update.title || updated.title || params.entryId}`,
    actorUid: auth.uid,
    role: auth.role,
    metadata: { action: "edit_timeline", id: docResult.ref.id }
  });

  return NextResponse.json(toPlain({ ok: true, id: docResult.ref.id, timeline: { id: docResult.ref.id, ...updated } }));
}

export async function DELETE(req: NextRequest, { params }: { params: { orgSlug: string; entryId: string } }) {
  return NextResponse.json({ error: "Deletion not allowed" }, { status: 405 });
}
