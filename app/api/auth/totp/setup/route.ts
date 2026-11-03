import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, isStrongAdminAuth, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { listPasskeys } from "@/src/lib/passkeys";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { formatSecretForDisplay } from "@/src/lib/totp";
import { beginTotpEnrollment } from "@/src/lib/totpStore";
import { totpErrorResponse } from "@/src/lib/totpRoutes";

export const dynamic = "force-dynamic";

/**
 * Starts authenticator-app setup: returns the seed (for the QR code) once. An admin who already has a
 * passkey must be signed in with it: an email link alone must not be able to add a second way in.
 */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, authMethod } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    const rate = await checkRateLimit(`totp-setup:${actor.uid}`, 10, 10 * 60 * 1000);
    if (!rate.success) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });

    if (!isStrongAdminAuth(authMethod) && (await listPasskeys(actor.uid)).some(p => p.status === "active")) {
      throw new AdminAccessError(403, "Sign in with your passkey to add an authenticator app", "PASSKEY_REQUIRED");
    }
    const { secretBytes, uri } = await beginTotpEnrollment(actor.uid, actor.email ?? actor.name ?? actor.uid);
    return NextResponse.json({ uri, secret: formatSecretForDisplay(secretBytes) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return totpErrorResponse(error);
  }
}
