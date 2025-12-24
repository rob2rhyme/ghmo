import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest, assertMember, type Role } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";
import { COMMUNITY_ID } from "@/src/lib/community";

export async function POST(req: NextRequest) {
  const { templateId, inputs, outputRefs, orgId, communityId } = await req.json();
  const targetCommunityId = communityId || orgId || COMMUNITY_ID;

  const member = await assertMember(req);
  const adminAuth = member ? null : await getAuthContextFromRequest(req);
  const authorized =
    member || (adminAuth && adminAuth.role === "admin" && adminAuth.communityId === targetCommunityId);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actorUid = member ? member.uid : (adminAuth as any).uid;
  const actorRole: Role = member ? "member" : "admin";

  const ref = adminDb.collection(`community/${targetCommunityId}/docgen/generations`);
  const doc = await ref.add({
    templateId,
    inputs,
    createdBy: actorUid,
    createdAt: new Date(),
    outputRefs
  });
  await logAudit({
    communityId: targetCommunityId,
    type: "doc_generated",
    actorUid,
    role: actorRole,
    metadata: { templateId, generationId: doc.id }
  });
  return NextResponse.json({ ok: true, id: doc.id });
}
