import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContextFromRequest(req);
  const decodedInfo = ctx
    ? {
        uid: ctx.uid,
        orgSlug: ctx.orgSlug,
        role: ctx.role,
        email: ctx.email,
        emailLower: ctx.emailLower,
        pinId: (ctx as any).pinId
      }
    : null;
  console.debug("Auth/me request", {
    authenticated: Boolean(ctx),
    decoded: decodedInfo,
    url: req.url
  });
  if (!ctx) return NextResponse.json({ authenticated: false, role: null, uid: null, orgSlug: null });
  if (!ctx.orgSlug) {
    console.warn("Auth/me missing orgSlug claim", { uid: ctx.uid, decoded: decodedInfo });
    return NextResponse.json({
      authenticated: false,
      isAdmin: false,
      role: null,
      uid: null,
      orgSlug: null,
      error: "MISSING_ORGSLUG_CLAIM"
    });
  }

  try {
    const { actor } = await requireActiveAdmin(req, ctx.orgSlug);
    console.debug("Auth/me admin lookup succeeded", { uid: ctx.uid, emailLower: ctx.emailLower, adminDocId: actor.adminDocId });
    return NextResponse.json({
      authenticated: true,
      isAdmin: true,
      role: actor.roles[0] ?? "admin",
      uid: ctx.uid,
      orgSlug: ctx.orgSlug,
      adminId: actor.adminDocId,
      roles: actor.roles
    });
  } catch (err) {
    if (err instanceof AdminAccessError) {
      console.warn("Auth/me admin guard failed", { uid: ctx.uid, reason: err.reason });
      return NextResponse.json({
        authenticated: false,
        isAdmin: false,
        role: null,
        uid: null,
        orgSlug: null,
        error: err.message,
        reason: err.reason
      });
    }
    console.error("Auth/me unexpected error", err);
    return NextResponse.json({
      authenticated: false,
      isAdmin: false,
      role: null,
      uid: null,
      orgSlug: null,
      error: "Unexpected error"
    });
  }
}
