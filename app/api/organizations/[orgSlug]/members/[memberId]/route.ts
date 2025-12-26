import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberName, isMemberStatus, sanitizeMemberRoles } from "@/src/lib/members";
import { toPlain } from "@/src/lib/serialize.server";

const MEMBER_PATCH_ROUTE = "/api/organizations/ghmo/members/[memberId]";

function buildAuditMeta(req: NextRequest, route: string) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown",
    userAgent: req.headers.get("user-agent") ?? null,
    route
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { orgSlug: string; memberId: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;

  const { memberId } = params;
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const memberRef = adminDb.doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}`);
  const snapshot = await memberRef.get();
  if (!snapshot.exists) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const beforeData = snapshot.data() as Record<string, unknown>;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let hasChange = false;

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = normalizeMemberName(body.name);
    updates.name = name ?? null;
    hasChange = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "status") && typeof body.status === "string" && isMemberStatus(body.status)) {
    updates.status = body.status;
    hasChange = true;
  }

  if (Array.isArray(body.roles)) {
    const roles = sanitizeMemberRoles(body.roles);
    if (roles.length > 0) {
      updates.roles = roles;
      hasChange = true;
    }
  }

  if (!hasChange) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await memberRef.set(updates, { merge: true });
  const afterSnapshot = await memberRef.get();
  const afterData = afterSnapshot.data() as Record<string, unknown>;
  const meta = buildAuditMeta(req, MEMBER_PATCH_ROUTE);
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "member_updated",
    actor: {
      uid: actor.uid,
      adminId: admin.pinId,
      role: actor.roles[0] ?? "admin",
      name: admin.name,
      email: admin.email
    },
    resource: { type: "member", id: memberId, path: memberRef.path },
    before: toPlain({ id: memberId, ...beforeData }),
    after: toPlain({ id: memberId, ...afterData }),
    meta
  });

  return NextResponse.json({ ok: true, member: toPlain({ id: memberId, ...afterData }) });
}
