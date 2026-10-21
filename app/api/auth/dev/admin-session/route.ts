import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { safeEqual } from "@/src/lib/security/compare";
import { isDevLoginAllowed } from "@/src/lib/security/devLogin";
import { getClientIp } from "@/src/lib/security/clientIp";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { issueCustomToken, verifyIdToken, type Role } from "@/src/lib/auth";
import { createSessionResponse } from "@/src/lib/sessionCookies";
import { logAuditEvent } from "@/src/lib/audit";
import { orgAdminDocPath, orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail } from "@/src/lib/members";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

const ROUTE = "/api/auth/dev/admin-session";

export const dynamic = "force-dynamic";

function buildMeta(req: NextRequest) {
  return {
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? null,
    route: ROUTE
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
    if (!isDevLoginAllowed(process.env)) {
      return new Response("Not Found", { status: 404 });
    }

    const rate = await checkRateLimit(`dev-login:${getClientIp(req.headers)}`, 10, 10 * 60 * 1000);
    if (!rate.success) return new Response("Not Found", { status: 404 });

    // Header only: query strings end up in access logs.
    if (!safeEqual(req.headers.get("x-dev-login-token"), process.env.DEV_ADMIN_LOGIN_TOKEN?.trim())) {
      return new Response("Not Found", { status: 404 });
    }

    const body = (await req.json()) as { orgSlug?: string; email?: string };

    const orgSlug = body.orgSlug?.trim();
    if (!orgSlug) {
      return NextResponse.json({ error: "Missing organization" }, { status: 400 });
    }

    const emailValue = body.email?.trim();
    const emailLower = normalizeMemberEmail(emailValue);
    if (!emailLower) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const db = getAdminDb();
    const snapshot = await db
      .collection(orgAdminsCollectionPath(orgSlug))
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    const adminDoc = snapshot.docs[0];
    const adminData = adminDoc.data();
    if (adminData.status !== "active") {
      return NextResponse.json({ error: "Admin disabled" }, { status: 403 });
    }

    const roles = Array.isArray(adminData.roles) ? (adminData.roles as string[]) : [];
    const role: Role = (roles[0] as Role) ?? "admin";

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      console.warn("Missing NEXT_PUBLIC_FIREBASE_API_KEY; cannot issue dev session");
      return NextResponse.json({ error: "Dev login unavailable" }, { status: 503 });
    }

    const customToken = await issueCustomToken(adminDoc.id, role);

    const identityRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }
    );
    const identityPayload = await identityRes.json().catch(() => ({}));
    if (!identityRes.ok) {
      console.error("Dev session sign-in failed", { status: identityRes.status });
      return NextResponse.json({ error: "Unable to mint session" }, { status: 500 });
    }

    const idToken = identityPayload.idToken as string | undefined;
    if (!idToken) {
      return NextResponse.json({ error: "Unable to mint session" }, { status: 500 });
    }

    const decoded = await verifyIdToken(idToken);

    await db.doc(orgAdminDocPath(orgSlug, adminDoc.id)).set(
      {
        lastLoginAt: Timestamp.now(),
        authUid: decoded.uid
      },
      { merge: true }
    );

    await logAuditEvent({
      orgSlug,
      action: "login_dev",
      actor: {
        uid: decoded.uid,
        adminId: adminDoc.id,
        name: adminData.name as string | undefined,
        email: adminData.email as string | undefined,
        role
      },
      resource: { type: "admin_session", summary: "Dev login bypass" },
      meta: { ...buildMeta(req), emailLower }
    });

    const sessionResponse = await createSessionResponse(idToken, { devLogin: true, adminId: adminDoc.id });
    console.warn("[AUTH] Dev admin-session endpoint used", {
      orgSlug,
      adminId: adminDoc.id
    });
    return sessionResponse;
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
