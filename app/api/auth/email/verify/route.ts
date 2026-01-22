import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { issueCustomToken, verifyIdToken } from "@/src/lib/auth";
import { AdminEnvError, getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminDocPath, orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { logAuditEvent } from "@/src/lib/audit";
import { normalizeMemberEmail } from "@/src/lib/members";
import { createSessionResponse } from "@/src/lib/sessionCookies";

export const dynamic = "force-dynamic";

function buildAuditMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown",
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
    const body = (await req.json()) as {
      orgSlug?: string;
      email?: string;
      oobCode?: string;
      emailLink?: string;
    };
    let { orgSlug, email, oobCode, emailLink } = body;
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
      } catch (error) {
        console.warn("Invalid emailLink provided", error);
      }
    }

    const hasEmailLink = Boolean(emailLink);
    const hasOobCode = Boolean(resolvedOobCode);
    const normalizedEmail = normalizeMemberEmail(email);
    if (normalizedEmail) {
      emailLower = normalizedEmail;
    }

    if (!emailLower) {
      console.warn("Missing email in verify payload", { hasEmailLink, hasOobCode });
      return NextResponse.json({ error: "Email required for verification" }, { status: 400 });
    }

    if (!resolvedOobCode) {
      return NextResponse.json({ error: "Missing oobCode" }, { status: 400 });
    }

    const snapshot = await getAdminDb()
      .collection(orgAdminsCollectionPath(orgSlug))
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();
    if (snapshot.empty) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const adminDoc = snapshot.docs[0];
    const adminData = adminDoc.data();
    if (adminData.status !== "active") return NextResponse.json({ error: "Admin disabled" }, { status: 403 });

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
    console.debug("Verifying admin email link", {
      endpoint,
      emailLower,
      oobCodePreview: resolvedOobCode.slice(0, 6),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID
    });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyPayload)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("Email verify failed", text);
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

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
      const text = await signinRes.text().catch(() => "");
      console.warn("Custom token sign-in failed", text);
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

    return createSessionResponse(req, idToken);
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
