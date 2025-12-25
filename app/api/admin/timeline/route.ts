import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";

export async function GET(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const primarySnap = await adminDb
    .collection(orgTimelineCollectionPath(COMMUNITY_SLUG))
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();
  const fallbackSnap =
    primarySnap.empty
      ? await adminDb
          .collection(`community/${auth.communityId}/timeline`)
          .orderBy("timestamp", "desc")
          .limit(100)
          .get()
      : null;
  const sourceDocs = primarySnap.empty && fallbackSnap ? fallbackSnap.docs : primarySnap.docs;
  const items = sourceDocs.map(doc => {
    const data = doc.data() as Record<string, any>;
    const ts = data.timestamp;
    const timestamp =
      typeof ts?.toMillis === "function"
        ? ts.toMillis()
        : ts instanceof Date
          ? ts.getTime()
          : typeof ts === "number"
            ? ts
            : null;
    return { id: doc.id, ...data, timestamp };
  });
  return NextResponse.json(toPlain({ items }));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  const ref = adminDb.collection(orgTimelineCollectionPath(COMMUNITY_SLUG));
  const doc = await ref.add({
    title: data.title,
    body: data.body,
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: auth.uid,
    tags: data.tags || [],
    attachments: data.attachments || []
  });
  await logAudit({
    communityId: auth.communityId,
    type: "timeline_created",
    summary: `Created timeline entry: ${data.title}`,
    actorUid: auth.uid,
    role: auth.role,
    metadata: { timelineId: doc.id, title: data.title }
  });
  return NextResponse.json({ ok: true, id: doc.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, title, body, tags } = (await req.json()) as { id?: string; title?: string; body?: string; tags?: string[] };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (title !== undefined && !title.trim()) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });

  const ref = adminDb.collection(orgTimelineCollectionPath(COMMUNITY_SLUG)).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, any> = { updatedAt: new Date() };
  const changed: string[] = [];
  if (title !== undefined) {
    updates.title = title;
    changed.push("title");
  }
  if (body !== undefined) {
    updates.body = body;
    changed.push("body");
  }
  if (Array.isArray(tags)) {
    updates.tags = tags;
    changed.push("tags");
  }
  await ref.set(updates, { merge: true });
  const updatedSnap = await ref.get();
  const data = updatedSnap.data() || {};
  const ts = data.timestamp;
  const timestamp =
    typeof ts?.toMillis === "function"
      ? ts.toMillis()
      : ts instanceof Date
        ? ts.getTime()
        : typeof ts === "number"
          ? ts
          : null;

  await logAudit({
    communityId: auth.communityId,
    type: "admin_action",
    summary: `Updated timeline entry: ${data.title || id}`,
    actorUid: auth.uid,
    role: auth.role,
    metadata: { action: "timeline_update", timelineId: id, changedFields: changed, title: data.title }
  });

  return NextResponse.json(toPlain({ ok: true, item: { id, ...data, timestamp } }));
}
