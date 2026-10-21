import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { Timestamp } from "firebase-admin/firestore";
import { verifyIdToken, SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK } from "@/src/lib/auth";
import { logAuditEvent } from "@/src/lib/audit";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { requireActiveAdmin } from "@/src/lib/admin";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { createSessionResponse } from "@/src/lib/sessionCookies";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });
    const decoded = await verifyIdToken(idToken);
    return createSessionResponse(req, idToken, { ok: true, claims: decoded });
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

export async function DELETE(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  const response = NextResponse.json({ ok: true });
  const clearOptions = { httpOnly: true, maxAge: 0, path: "/" };
  response.cookies.set(SESSION_COOKIE_NAME, "", clearOptions);
  response.cookies.set(SESSION_COOKIE_NAME_FALLBACK, "", clearOptions);

  try {
    try {
      const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
      const db = getAdminDb();
      await db.doc(orgAdminDocPath(COMMUNITY_SLUG, admin.id)).set(
        {
          lastLogoutAt: Timestamp.now()
        },
        { merge: true }
      );
      const ip = getClientIp(req.headers);
      const userAgent = req.headers.get("user-agent") ?? null;
      await logAuditEvent({
        orgSlug: COMMUNITY_SLUG,
        action: "logout",
        actor: {
          uid: actor.uid,
          adminId: admin.id,
          name: actor.name,
          email: actor.email,
          role: actor.roles[0] ?? "admin"
        },
        resource: { type: "admin_session", summary: "Signed out" },
        meta: { ip, userAgent, route: "/api/auth/session" }
      });
    } catch (error) {
      if (error instanceof AdminEnvError) {
        throw error;
      }
      // ignore guard failures; cookies are cleared anyway.
    }
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }

  return response;
}
