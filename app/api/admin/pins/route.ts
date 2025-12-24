import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest, hashPin } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const snapshot = await adminDb.collection(`community/${auth.communityId}/pins`).get();
  const pins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), pinHash: undefined }));
  return NextResponse.json({ pins });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { pin, role, label } = await req.json();
  if (!pin || !role) return NextResponse.json({ error: "Missing pin or role" }, { status: 400 });
  const pinHash = await hashPin(pin);
  const ref = adminDb.collection(`community/${auth.communityId}/pins`);
  const doc = await ref.add({
    role,
    label,
    pinHash,
    status: "active",
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: new Date()
  });
  await logAudit({ communityId: auth.communityId, type: "admin_action", actorUid: auth.uid, role: auth.role, metadata: { action: "create_pin", pinId: doc.id } });
  return NextResponse.json({ ok: true, id: doc.id });
}
