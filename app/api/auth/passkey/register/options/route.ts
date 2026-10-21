import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { getWebAuthnConfig, listPasskeys, saveChallenge } from "@/src/lib/passkeys";
import { checkRateLimit } from "@/src/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Starts passkey registration for the signed-in admin (magic-link sessions allowed). */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    const rate = await checkRateLimit(`passkey-register:${actor.uid}`, 10, 10 * 60 * 1000);
    if (!rate.success) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

    const { rpID, rpName } = getWebAuthnConfig(req);
    const existing = await listPasskeys(actor.uid);
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: actor.email ?? actor.uid,
      userDisplayName: actor.name ?? actor.email ?? "GHMO admin",
      userID: new TextEncoder().encode(actor.uid),
      attestationType: "none",
      excludeCredentials: existing.map(p => ({ id: p.credentialId, transports: p.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      // Ask whether the authenticator supports PRF (used to unlock E2EE keys in Phase 3).
      extensions: { prf: {} } as Record<string, unknown>
    });
    const challengeId = await saveChallenge("register", options.challenge, actor.uid);
    return NextResponse.json({ options, challengeId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
