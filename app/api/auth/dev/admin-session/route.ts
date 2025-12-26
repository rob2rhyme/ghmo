import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { issueCustomToken, verifyIdToken, type Role } from "@/src/lib/auth";
import { createSessionResponse } from "@/src/lib/sessionCookies";
import { logAuditEvent } from "@/src/lib/audit";
import { orgAdminDocPath, orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail } from "@/src/lib/members";
import { COMMUNITY_ID } from "@/src/lib/community";

const ROUTE = "/api/auth/dev/admin-session";

function buildMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown",
    userAgent: req.headers.get("user-agent") ?? null,
    route: ROUTE
  };
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.DEV_LOGIN_SECRET;
  if (!secret) {
    console.error("DEV_LOGIN_SECRET missing while attempting dev admin session");
    return NextResponse.json({ error: "Dev login misconfigured" }, { status: 500 });
  }

  const body = (await req.json()) as { orgSlug?: string; email?: string; devLoginSecret?: string };
  const providedSecret = req.headers.get("x-dev-login-secret") || body.devLoginSecret;
  if (!providedSecret || providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgSlug = body.orgSlug?.trim();
  if (!orgSlug) {
    return NextResponse.json({ error: "Missing organization" }, { status: 400 });
  }

  const emailValue = body.email?.trim();
  const emailLower = normalizeMemberEmail(emailValue);
  if (!emailLower) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const snapshot = await adminDb
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
    console.error("Dev session sign-in failed", { status: identityRes.status, body: identityPayload });
    return NextResponse.json({ error: "Unable to mint session" }, { status: 500 });
  }

  const idToken = identityPayload.idToken as string | undefined;
  if (!idToken) {
    return NextResponse.json({ error: "Unable to mint session" }, { status: 500 });
  }

  const decoded = await verifyIdToken(idToken);

  await adminDb.doc(orgAdminDocPath(orgSlug, adminDoc.id)).set(
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

  const sessionResponse = createSessionResponse(req, idToken, { devLogin: true, adminId: adminDoc.id });
  console.info("Dev login granted", {
    orgSlug,
    adminId: adminDoc.id,
    emailLower,
    cookiesAttached: true
  });
  return sessionResponse;
}
