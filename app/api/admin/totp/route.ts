import { NextRequest, NextResponse } from "next/server";
import { listAdmins, requireSuperAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { getTotpStatus } from "@/src/lib/totpStore";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

/** Super admins: which other admins have an authenticator app set up (for the reset list). */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const admins = (await listAdmins(COMMUNITY_SLUG)).filter(a => a.status === "active" && a.id !== actor.uid);
    const withStatus = await Promise.all(
      admins.map(async a => ({ uid: a.id, name: a.name, email: a.email ?? null, totp: (await getTotpStatus(a.id)).state }))
    );
    return NextResponse.json({ admins: withStatus.filter(a => a.totp === "active") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
