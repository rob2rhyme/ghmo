import { NextRequest, NextResponse } from "next/server";
import { hashPin } from "@/src/lib/auth";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export async function GET(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const snapshot = await getAdminDb().collection(`organizations/${COMMUNITY_SLUG}/pins`).get();
  const pins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), pinHash: undefined }));
  return NextResponse.json({ pins });
}

export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor } = guard;
  const { pin, role, label } = await req.json();
  if (!pin || !role) return NextResponse.json({ error: "Missing pin or role" }, { status: 400 });
  const pinHash = await hashPin(pin);
  const ref = getAdminDb().collection(`organizations/${COMMUNITY_SLUG}/pins`);
  const doc = await ref.add({
    role,
    label,
    pinHash,
    status: "active",
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: new Date()
  });
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "admin_pin_created",
    actor: {
      uid: actor.uid,
      adminId: actor.adminDocId,
      name: actor.name,
      email: actor.email,
      role: actor.roles[0] ?? "admin"
    },
    resource: { type: "pin", id: doc.id, summary: `Created PIN ${label || doc.id}` },
    meta: { pinId: doc.id, role, label, route: "/api/admin/pins" }
  });
  return NextResponse.json({ ok: true, id: doc.id });
}
