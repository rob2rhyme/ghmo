import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK, getAuthContextFromRequest } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit";

export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const decoded = await verifyIdToken(idToken);
  const response = NextResponse.json({ ok: true, claims: decoded });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: 60 * 60
  };
  response.cookies.set(SESSION_COOKIE_NAME, idToken, cookieOptions);
  // __session is the default cookie name honored by Firebase Hosting/Edge-safe checks.
  response.cookies.set(SESSION_COOKIE_NAME_FALLBACK, idToken, cookieOptions);
  return response;
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContextFromRequest(req);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/" });
  response.cookies.set(SESSION_COOKIE_NAME_FALLBACK, "", { httpOnly: true, maxAge: 0, path: "/" });
  if (ctx) {
    await logAudit({
      communityId: ctx.communityId,
      type: "admin_action",
      summary: `Signed out (${ctx.role})`,
      actorUid: ctx.uid,
      role: ctx.role,
      metadata: { action: "sign_out" }
    });
  }
  return response;
}
