import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, isStrongAdminAuth, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { listPasskeys } from "@/src/lib/passkeys";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { confirmTotpEnrollment } from "@/src/lib/totpStore";
import { startTotpSession, totpErrorResponse } from "@/src/lib/totpRoutes";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(1).max(20) });

/** Finishes setup with the first code from the app; returns the one-time recovery codes. */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, admin, authMethod } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    const rate = await checkRateLimit(`totp-confirm:${actor.uid}`, 10, 10 * 60 * 1000);
    if (!rate.success) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;

    const strong = isStrongAdminAuth(authMethod);
    if (!strong && (await listPasskeys(actor.uid)).some(p => p.status === "active")) {
      throw new AdminAccessError(403, "Sign in with your passkey to add an authenticator app", "PASSKEY_REQUIRED");
    }
    const recoveryCodes = await confirmTotpEnrollment(actor.uid, parsed.data.code);

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "totp_enrolled",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "authenticator", summary: "Authenticator app set up" },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: "/api/auth/totp/confirm" }
    });

    // Setup after an email link proves the app works, so it also completes this sign-in.
    if (!strong) return await startTotpSession(actor.uid, { ok: true, recoveryCodes });
    return NextResponse.json({ ok: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
