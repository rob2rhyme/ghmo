import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { findActiveMember, SESSION_COOKIE_NAME, verifyIdToken } from "@/src/lib/auth";
import { logAuditEvent } from "@/src/lib/audit";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebaseAdmin";
import { requireActiveAdmin } from "@/src/lib/admin";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { clearSessionCookies, createSessionResponse } from "@/src/lib/sessionCookies";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ idToken: z.string().min(20).max(8192) });

/**
 * Exchanges a fresh ID token for a member session cookie (the member email-link sign-in). Admin sessions are
 * never made here: they come only from the server-side sign-in steps (passkey, authenticator, email link), so
 * a token the browser holds (for example the Firestore token from /api/auth/firebase-custom-token) can't be
 * turned into a new admin session.
 */
export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json({ error: "This can't be loaded right now. Try again in a few minutes." }, { status: 503 });
  }

  const rate = await checkRateLimit(`session-create:${getClientIp(req.headers)}`, 20, 10 * 60 * 1000);
  if (!rate.success) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });

  // Through the shared parser, so an oversized body is refused before it is read in full.
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return NextResponse.json({ error: "Missing token" }, { status: parsed.response.status === 413 ? 413 : 400 });

  try {
    let decoded;
    try {
      decoded = await verifyIdToken(parsed.data.idToken);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const claims = decoded as typeof decoded & { role?: string; admin?: boolean };
    // Admin tokens are refused outright (see above), even when the same person is also a member.
    if (claims.role === "admin" || claims.admin === true) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const allowed = Boolean(await findActiveMember(decoded));
    if (!allowed) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    return await createSessionResponse(parsed.data.idToken);
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json({ error: "This can't be loaded right now. Try again in a few minutes." }, { status: 503 });
    }
    throw error;
  }
}

/** Signs out: revokes every refresh token for the user, then clears cookies. */
export async function DELETE(req: NextRequest) {
  const response = clearSessionCookies(NextResponse.json({ ok: true }));
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) return response;

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return response;

  try {
    // Audit first, while the session is still valid.
    try {
      const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
      await getAdminDb().doc(orgAdminDocPath(COMMUNITY_SLUG, admin.id)).set({ lastLogoutAt: Timestamp.now() }, { merge: true });
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
        meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: "/api/auth/session" }
      });
    } catch {
      // Not an admin (or already invalid): still revoke below.
    }

    // No revocation check here: we want the uid even if the session is already revoked.
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, false);
    await getAdminAuth().revokeRefreshTokens(decoded.sub);
  } catch {
    // Invalid or expired cookie: clearing it is enough.
  }

  return response;
}
