import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getTotpStatus, removeTotp } from "@/src/lib/totpStore";
import { clearRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ownerUid: string }> };

const bodySchema = z.object({ confirmedWithAdmin: z.literal(true) });

/**
 * A super admin resets another admin's authenticator app (lost phone, no recovery codes, or code sign-in locked
 * after too many wrong codes). The admin is signed out everywhere and sets up a new app after their next
 * email-link sign-in. A lock means someone with that admin's inbox may have been guessing, and after a reset the
 * inbox alone is enough to set up a new app; so the super admin must confirm they spoke with the admin (by
 * phone or in person) that they asked for it, and the confirmation is recorded.
 */
export async function DELETE(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { ownerUid } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ownerUid === actor.uid) return NextResponse.json({ error: "Another super admin must reset your authenticator" }, { status: 403 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Confirm that you spoke with this admin first.", code: "CONFIRM_REQUIRED" }, { status: 400 });
    }
    const before = await getTotpStatus(ownerUid);
    if (!(await removeTotp(ownerUid))) return NextResponse.json({ error: "No authenticator app to reset" }, { status: 404 });
    await getAdminAuth().revokeRefreshTokens(ownerUid);
    // A fresh start: earlier wrong codes don't count towards a new lock.
    await clearRateLimit(`totp-fail-day:${ownerUid}`);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "totp_reset",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "authenticator", id: ownerUid, summary: `Reset authenticator app of ${ownerUid}` },
      meta: { ip: getClientIp(req.headers), route: "/api/admin/totp", wasLocked: before.locked, confirmedWithAdmin: true }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
