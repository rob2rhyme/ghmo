import { NextRequest, NextResponse } from "next/server";
import { exchangeCustomTokenForIdToken } from "@/src/lib/firebaseAuthRest";
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
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

const ROUTE = "/api/auth/dev/admin-session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgSlug: z.string().trim().max(100).regex(/^[a-z0-9-]*$/i).optional(),
  email: z.string().trim().max(320).optional()
});

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
      { error: "This can't be loaded right now. Try again in a few minutes." },
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

    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const orgSlug = body.orgSlug;
    if (!orgSlug) {
      return NextResponse.json({ error: "Missing organization" }, { status: 400 });
    }

    const emailLower = normalizeMemberEmail(body.email);
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

    // Dev sessions only count as strong auth outside production (see requireActiveAdmin).
    const customToken = await issueCustomToken(adminDoc.id, role, "dev");
    const idToken = await exchangeCustomTokenForIdToken(customToken);
    if (!idToken) {
      return NextResponse.json({ error: "Signing in didn't finish. Try again in a few minutes." }, { status: 500 });
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
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}
