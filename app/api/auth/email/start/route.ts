//app/api/auth/email/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { AdminEnvError, getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";
import { logAuditEvent } from "@/src/lib/audit";
import { orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail } from "@/src/lib/members";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAppOrigin } from "@/src/lib/appUrl";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

const GENERIC_MESSAGE = "If your admin access is enabled, you'll receive an email with a sign-in link shortly.";

export const dynamic = "force-dynamic";

// `email` stays optional/loosely typed: a blank or malformed address gets the same
// generic answer as an unknown one, so validation cannot be used for enumeration.
const bodySchema = z.object({
  orgSlug: z.string().trim().max(100).regex(/^[a-z0-9-]*$/i).optional(),
  email: z.string().max(320).optional()
});
const emailFormat = z.string().email().max(320);

function buildAuditMeta(req: NextRequest) {
  return {
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? null,
    route: "/api/auth/email/start"
  };
}

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { FEATURE_EMAIL_ADMIN_LOGIN } = getServerEnv();
    if (!FEATURE_EMAIL_ADMIN_LOGIN) {
      return NextResponse.json({ error: "Email login disabled" }, { status: 404 });
    }
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const orgSlug = parsed.data.orgSlug;
    if (!orgSlug) return NextResponse.json({ error: "Missing organization" }, { status: 400 });
    // Single community: never query or audit under a client-chosen organization.
    if (orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const emailLower = normalizeMemberEmail(parsed.data.email);
    if (!emailLower || !emailFormat.safeParse(emailLower).success) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const meta = { ...buildAuditMeta(req), emailLower };
    const ipLimit = await checkRateLimit(`email-start:${orgSlug}:${meta.ip}`, 5, 5 * 60 * 1000);
    const emailLimit = await checkRateLimit(`email-start:${orgSlug}:email:${emailLower}`, 5, 5 * 60 * 1000);
    if (!ipLimit.success || !emailLimit.success) {
      return NextResponse.json(
        {
          ok: true,
          message: GENERIC_MESSAGE,
          retryInMs: Math.max(ipLimit.success ? 0 : ipLimit.retryInMs, emailLimit.success ? 0 : emailLimit.retryInMs)
        },
        { status: 429 }
      );
    }

    const snapshot = await getAdminDb()
      .collection(orgAdminsCollectionPath(orgSlug))
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();

    if (snapshot.empty || snapshot.docs[0].data().status !== "active") {
      await logAuditEvent({
        orgSlug,
        action: "login_start",
        resource: { type: "admin_login_request" },
        meta
      });
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      console.warn("Missing NEXT_PUBLIC_FIREBASE_API_KEY; cannot send email login link");
      return NextResponse.json({ error: "Email login is temporarily unavailable" }, { status: 503 });
    }

    // Never log the email, continue URL or Identity Toolkit body (plan S-08).
    const continueUrl = `${getAppOrigin(req)}/admin/login?mode=signIn&email=${encodeURIComponent(emailLower)}`;
    try {
      const identityRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestType: "EMAIL_SIGNIN",
            email: emailLower,
            continueUrl,
            canHandleCodeInApp: true
          })
        }
      );
      if (!identityRes.ok) {
        const body = (await identityRes.json().catch(() => ({}))) as { error?: { message?: string } };
        const code = String(body.error?.message ?? "UNKNOWN");
        if (code.startsWith("QUOTA_EXCEEDED")) {
          console.warn("Identity Toolkit sendOobCode quota exceeded");
          return NextResponse.json(
            {
              ok: false,
              code: "QUOTA_EXCEEDED",
              message: "Daily email sign-in quota exceeded. Try again tomorrow or enable billing."
            },
            { status: 429 }
          );
        }
        console.error("Identity Toolkit sendOobCode failed", { status: identityRes.status, code });
        return NextResponse.json(
          { ok: false, code: "SEND_FAILED", message: "Unable to send sign-in link right now." },
          { status: 503 }
        );
      }
    } catch (error) {
      console.error("Failed to send admin email sign-in link", error instanceof Error ? error.message : "unknown error");
      return NextResponse.json({ error: "Unable to send sign-in link right now" }, { status: 500 });
    }

    await logAuditEvent({
      orgSlug,
      action: "login_start",
      resource: { type: "admin_login_request", id: snapshot.docs[0].id },
      meta
    });
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
