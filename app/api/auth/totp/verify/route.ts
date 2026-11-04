import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isStrongAdminAuth, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { checkRateLimit, clearRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { lockTotp, verifyTotpLogin } from "@/src/lib/totpStore";
import { notifyAdmins } from "@/src/lib/notify.server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { startTotpSession, totpErrorResponse } from "@/src/lib/totpRoutes";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(1).max(30) });
const FAILED = "That code didn't match. Type the newest code from your app (it changes every 30 seconds).";
const LOCKED = "Code sign-in is locked after too many wrong codes, and recovery codes are locked too. Sign in with your passkey, or ask a super admin to reset your authenticator.";
/** The wrong code that locks code sign-in, counted per admin per day, on top of the short-window limit below. */
const DAILY_FAILURES = 20;
const dailyFailureKey = (uid: string) => `totp-fail-day:${uid}`;

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
      if (result.locked) return NextResponse.json({ error: LOCKED, code: "TOTP_LOCKED" }, { status: 423 });
      await logAuditEvent({ orgSlug: COMMUNITY_SLUG, action: "totp_login_failed", actor: who, resource: { type: "authenticator", summary: "Wrong code" }, meta });
      // The short window above slows guessing; this caps it. Someone holding only the inbox can't keep trying for weeks.
      // The limiter allows `limit` hits and refuses the next, so the 20th wrong code is the refused one.
      const daily = await checkRateLimit(dailyFailureKey(actor.uid), DAILY_FAILURES - 1, 24 * 60 * 60 * 1000);
      if (!daily.success) {
        await lockTotp(actor.uid);
        await logAuditEvent({ orgSlug: COMMUNITY_SLUG, action: "totp_locked", actor: who, resource: { type: "authenticator", summary: "Locked after too many wrong codes" }, meta });
        await notifyAdmins("security", actor.uid, getAppOrigin(req));
        return NextResponse.json({ error: LOCKED, code: "TOTP_LOCKED" }, { status: 423 });
      }
      return NextResponse.json({ error: FAILED }, { status: 401 });
    }
    // A good code clears the day's wrong-code count, so earlier typos don't add up to a lock.
    await clearRateLimit(dailyFailureKey(actor.uid));
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
