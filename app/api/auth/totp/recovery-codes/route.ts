import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { regenerateRecoveryCodes } from "@/src/lib/totpStore";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

/** New recovery codes (the old ones stop working). Needs a fully signed-in session. */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const rate = await checkRateLimit(`totp-recovery:${actor.uid}`, 5, 10 * 60 * 1000);
    if (!rate.success) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    const recoveryCodes = await regenerateRecoveryCodes(actor.uid);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "totp_recovery_codes_regenerated",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "authenticator", summary: "Recovery codes replaced" },
      meta: { ip: getClientIp(req.headers), route: "/api/auth/totp/recovery-codes" }
    });
    return NextResponse.json({ recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
