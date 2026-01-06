import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { verifyIdToken, SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK } from "@/src/lib/auth";
import { logAuditEvent } from "@/src/lib/audit";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { requireActiveAdmin } from "@/src/lib/admin";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { createSessionResponse } from "@/src/lib/sessionCookies";

export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const decoded = await verifyIdToken(idToken);
  return createSessionResponse(req, idToken, { ok: true, claims: decoded });
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const clearOptions = { httpOnly: true, maxAge: 0, path: "/" };
  response.cookies.set(SESSION_COOKIE_NAME, "", clearOptions);
  response.cookies.set(SESSION_COOKIE_NAME_FALLBACK, "", clearOptions);

  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const db = getAdminDb();
    await db.doc(orgAdminDocPath(COMMUNITY_SLUG, admin.id)).set(
      {
        lastLogoutAt: Timestamp.now()
      },
      { merge: true }
    );
    const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
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
  } catch {
    // ignore guard failures; cookies are cleared anyway.
  }

  return response;
}
