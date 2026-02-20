//app/api/auth/email/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { AdminEnvError, getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";
import { logAuditEvent } from "@/src/lib/audit";
import { orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail } from "@/src/lib/members";

const GENERIC_MESSAGE = "If your admin access is enabled, you'll receive an email with a sign-in link shortly.";

export const dynamic = "force-dynamic";

function buildAuditMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
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
    const payload = (await req.json()) as { orgSlug?: string; email?: string };
    const orgSlug = payload.orgSlug?.trim();
    if (!orgSlug) return NextResponse.json({ error: "Missing organization" }, { status: 400 });

    const emailValue = payload.email?.trim();
    const emailLower = normalizeMemberEmail(emailValue);
    if (!emailLower) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const meta = { ...buildAuditMeta(req), emailLower };
    const ipLimit = checkRateLimit(`email-start:${orgSlug}:${meta.ip}`, 5, 5 * 60 * 1000);
    const emailLimit = checkRateLimit(`email-start:${orgSlug}:email:${emailLower}`, 5, 5 * 60 * 1000);
    if (!ipLimit.success || !emailLimit.success) {
      return NextResponse.json(
        {
          ok: true,
          message: GENERIC_MESSAGE,
          retryInMs: Math.max(ipLimit.retryInMs ?? 0, emailLimit.retryInMs ?? 0)
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

    const continueUrl = `${req.nextUrl.origin}/admin/login?mode=signIn&email=${encodeURIComponent(emailLower)}`;
    const requestType = "EMAIL_SIGNIN";
    let identityResponseBody: Record<string, unknown> = {};
    try {
      console.debug("Sending admin email link", { requestType, continueUrl, emailLower });
      const identityRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestType,
            email: emailLower,
            continueUrl,
            canHandleCodeInApp: true
          })
        }
      );
      identityResponseBody = await identityRes.json().catch(() => ({}));
      console.debug("Identity Toolkit sendOobCode response", {
        status: identityRes.status,
        keys: Object.keys(identityResponseBody),
        continueUrl,
        emailLower
      });
      if (!identityRes.ok) {
        const identityBodyAny = identityResponseBody as Record<string, any>;
        const identityError = identityBodyAny?.error;
        const errorMessage =
          identityError?.message ||
          identityError?.errors?.[0]?.message ||
          identityBodyAny?.error?.code ||
          "UNKNOWN";
        const errorMessageString = String(errorMessage);
        if (
          errorMessageString === "QUOTA_EXCEEDED" ||
          errorMessageString.startsWith("QUOTA_EXCEEDED")
        ) {
          console.warn("Identity Toolkit sendOobCode quota exceeded", {
            emailLower,
            continueUrl,
            message: errorMessageString
          });
          return NextResponse.json(
            {
              ok: false,
              code: "QUOTA_EXCEEDED",
              message: "Daily email sign-in quota exceeded. Try again tomorrow or enable billing."
            },
            { status: 429 }
          );
        }
        console.error("Identity Toolkit sendOobCode failed", {
          status: identityRes.status,
          code: errorMessageString,
          body: identityResponseBody,
          emailLower,
          continueUrl
        });
        return NextResponse.json(
          { ok: false, code: "SEND_FAILED", message: "Unable to send sign-in link right now." },
          { status: 503 }
        );
      }
    } catch (error) {
      console.error("Failed to send admin email sign-in link", {
        error,
        emailLower,
        continueUrl
      });
      return NextResponse.json(
        { error: "Unable to send sign-in link right now" },
        { status: 500 }
      );
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
