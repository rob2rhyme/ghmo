import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { Timestamp } from "firebase-admin/firestore";
import { issueCustomToken, verifyIdToken } from "@/src/lib/auth";
import { AdminEnvError, getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminDocPath, orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { logAuditEvent } from "@/src/lib/audit";
import { normalizeMemberEmail } from "@/src/lib/members";
import { createSessionResponse } from "@/src/lib/sessionCookies";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const INVALID_LINK = "Invalid or expired link";

const bodySchema = z.object({
  orgSlug: z.string().max(100).optional(),
  email: z.string().max(320).optional(),
  oobCode: z.string().max(2048).optional(),
  // The full window.location.href of the magic link page.
  emailLink: z.string().max(8192).optional()
});

function buildAuditMeta(req: NextRequest) {
  return {
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? null,
    route: "/api/auth/email/verify"
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
    const verifyLimit = await checkRateLimit(`email-verify:${getClientIp(req.headers)}`, 10, 10 * 60 * 1000);
    if (!verifyLimit.success) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }
    const parsedBody = await parseJsonBody(req, bodySchema);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data;
    const { orgSlug, oobCode, emailLink } = body;
    let { email } = body;
    if (orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let emailLower = normalizeMemberEmail(email);
    let resolvedOobCode = oobCode;

    if (!emailLower && emailLink) {
      try {
        const parsed = new URL(emailLink);
        resolvedOobCode = resolvedOobCode || parsed.searchParams.get("oobCode") || undefined;
        const emailFromLink = parsed.searchParams.get("email");
        if (emailFromLink) {
          emailLower = normalizeMemberEmail(emailFromLink);
        }
        if (!email && parsed.searchParams.get("email")) {
          email = parsed.searchParams.get("email") || email;
        }
      } catch {
        // Invalid link: handled below as a generic failure.
      }
    }

    const normalizedEmail = normalizeMemberEmail(email);
    if (normalizedEmail) {
      emailLower = normalizedEmail;
    }

    if (!emailLower) {
      return NextResponse.json({ error: "Email required for verification" }, { status: 400 });
    }

    if (!resolvedOobCode) {
      return NextResponse.json({ error: "Missing oobCode" }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      console.warn("Missing NEXT_PUBLIC_FIREBASE_API_KEY; cannot verify email login");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const verifyPayload: Record<string, unknown> = {
      returnSecureToken: true,
      email: emailLower,
      oobCode: resolvedOobCode
    };

    const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyPayload)
    });
    // Verify the one-time link BEFORE looking at the allowlist, and give the same
    // answer for every failure, so this endpoint cannot be used to discover which
    // emails belong to admins.
    if (!response.ok) {
      return NextResponse.json({ error: INVALID_LINK }, { status: 400 });
    }

    const snapshot = await getAdminDb()
      .collection(orgAdminsCollectionPath(orgSlug))
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();
    if (snapshot.empty) return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

    const adminDoc = snapshot.docs[0];
    const adminData = adminDoc.data();
    if (adminData.status !== "active") return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

    const customToken = await issueCustomToken(adminDoc.id, "admin");
    const signinRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }
    );
    if (!signinRes.ok) {
      console.error("Custom token sign-in failed", { status: signinRes.status });
      return NextResponse.json({ error: "Unable to mint session" }, { status: 500 });
    }
    const signinPayload = await signinRes.json().catch(() => ({}));
    const idToken = signinPayload.idToken as string | undefined;
    if (!idToken) return NextResponse.json({ error: "Invalid token" }, { status: 500 });

    const decoded = await verifyIdToken(idToken);
    await getAdminDb().doc(orgAdminDocPath(orgSlug, adminDoc.id)).set(
      {
        lastLoginAt: Timestamp.now(),
        authUid: adminDoc.id
      },
      { merge: true }
    );

    await logAuditEvent({
      orgSlug,
      action: "login",
      actor: {
        uid: decoded.uid,
        adminId: adminDoc.id,
        name: adminData.name as string | undefined,
        email: adminData.email as string | undefined,
        role: Array.isArray(adminData.roles) ? (adminData.roles as string[])[0] : "admin"
      },
      resource: { type: "admin_session", summary: "Email magic link" },
      meta: { ...buildAuditMeta(req), emailLower }
    });

    return await createSessionResponse(idToken);
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
