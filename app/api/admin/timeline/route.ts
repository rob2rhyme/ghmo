import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const snapshot = await adminDb
    .collection(`community/${auth.communityId}/gumba/timeline`)
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();
  const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json();
  const ref = adminDb.collection(`community/${auth.communityId}/gumba/timeline`);
  const doc = await ref.add({
    title: data.title,
    body: data.body,
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    createdBy: auth.uid,
    tags: data.tags || [],
    attachments: data.attachments || []
  });
  await logAudit({ communityId: auth.communityId, type: "admin_action", actorUid: auth.uid, role: auth.role, metadata: { action: "create_timeline", id: doc.id } });
  return NextResponse.json({ ok: true, id: doc.id });
}
