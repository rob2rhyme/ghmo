import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { getWebAuthnConfig, passkeyAddressError, saveChallenge } from "@/src/lib/passkeys";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";

export const dynamic = "force-dynamic";

/** Starts a usernameless passkey sign-in (discoverable credentials). */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const rate = await checkRateLimit(`passkey-login-options:${getClientIp(req.headers)}`, 30, 10 * 60 * 1000);
  if (!rate.success) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  const wrongAddress = passkeyAddressError(req);
  if (wrongAddress) return NextResponse.json({ error: wrongAddress, code: "wrong_address" }, { status: 409 });

  const { rpID } = getWebAuthnConfig(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const challengeId = await saveChallenge("authenticate", options.challenge, null);
  return NextResponse.json({ options, challengeId }, { headers: { "Cache-Control": "no-store" } });
}
