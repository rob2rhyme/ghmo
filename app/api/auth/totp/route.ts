import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { listPasskeys } from "@/src/lib/passkeys";
import { getTotpStatus } from "@/src/lib/totpStore";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

/** Whether the signed-in admin has an authenticator app (and passkeys) set up. */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    const [totp, passkeys] = await Promise.all([getTotpStatus(actor.uid), listPasskeys(actor.uid)]);
    return NextResponse.json(
      { totp, hasActivePasskey: passkeys.some(p => p.status === "active") },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return totpErrorResponse(error);
  }
}
