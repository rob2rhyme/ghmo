import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  const ctx = await getAuthContextFromRequest(req);
  if (!ctx) return NextResponse.json({ authenticated: false, role: null, uid: null, orgSlug: null });
  if (!ctx.orgSlug) {
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
    // Pass the context already verified above, so the cookie is checked once; the guard's own admin record
    // read supplies the name and roles (no second lookup).
    const { actor, admin } = await requireActiveAdmin(ctx, ctx.orgSlug);
    const actorSnapshot = { name: admin.name, roles: admin.roles };
    return NextResponse.json({
      authenticated: true,
      isAdmin: true,
      role: actor.roles[0] ?? "admin",
      uid: ctx.uid,
      orgSlug: ctx.orgSlug,
      adminId: actor.adminDocId,
      roles: actor.roles,
      actor: actorSnapshot
    });
  } catch (err) {
    if (err instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Sign-in settings can't be loaded right now." },
        { status: 503 }
      );
    }
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
