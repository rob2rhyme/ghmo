import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { getClientIp } from "@/src/lib/security/clientIp";
import { removeTotp } from "@/src/lib/totpStore";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ownerUid: string }> };

/**
 * A super admin resets another admin's authenticator app (lost phone and no recovery codes). The admin
 * is signed out everywhere and sets up a new app after their next email-link sign-in.
 */
export async function DELETE(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { ownerUid } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ownerUid === actor.uid) return NextResponse.json({ error: "Another super admin must reset your authenticator" }, { status: 403 });
    if (!(await removeTotp(ownerUid))) return NextResponse.json({ error: "No authenticator app to reset" }, { status: 404 });
    await getAdminAuth().revokeRefreshTokens(ownerUid);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "totp_reset",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "authenticator", id: ownerUid, summary: `Reset authenticator app of ${ownerUid}` },
      meta: { ip: getClientIp(req.headers), route: "/api/admin/totp" }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
