import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isStrongAdminAuth, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { verifyTotpLogin } from "@/src/lib/totpStore";
import { startTotpSession, totpErrorResponse } from "@/src/lib/totpRoutes";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(1).max(30) });
const FAILED = "That code is not right";

/** Second step after the email link: an authenticator code (or a recovery code) completes the sign-in. */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, admin, authMethod } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    if (isStrongAdminAuth(authMethod)) return NextResponse.json({ ok: true });

    const ip = getClientIp(req.headers);
    const perAdmin = await checkRateLimit(`totp-verify:${actor.uid}`, 6, 10 * 60 * 1000);
    const perIp = await checkRateLimit(`totp-verify-ip:${ip}`, 30, 10 * 60 * 1000);
    if (!perAdmin.success || !perIp.success) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });

    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;

    const result = await verifyTotpLogin(actor.uid, parsed.data.code);
    const who = { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" };
    const meta = { ip, userAgent: req.headers.get("user-agent") ?? null, route: "/api/auth/totp/verify" };
    if (!result.ok) {
      await logAuditEvent({ orgSlug: COMMUNITY_SLUG, action: "totp_login_failed", actor: who, resource: { type: "authenticator", summary: "Wrong code" }, meta });
      return NextResponse.json({ error: FAILED }, { status: 401 });
    }
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "login",
      actor: who,
      resource: { type: "admin_session", summary: result.method === "recovery" ? "Authenticator: recovery code" : "Authenticator app" },
      meta
    });
    return await startTotpSession(actor.uid, { ok: true, usedRecoveryCode: result.method === "recovery", recoveryCodesLeft: result.recoveryCodesLeft });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
