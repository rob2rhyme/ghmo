import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";
import { getAdminProfile } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { issueCustomToken } from "@/src/lib/auth";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { exchangeCustomTokenForIdToken } from "@/src/lib/firebaseAuthRest";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { consumeChallenge, findPasskey, getWebAuthnConfig, recordPasskeyUse } from "@/src/lib/passkeys";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { createSessionResponse } from "@/src/lib/sessionCookies";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const FAILED = "Passkey sign-in failed";

const bodySchema = z.object({
  challengeId: z.string().min(16).max(64),
  response: z
    .object({
      id: z.string().max(1024),
      rawId: z.string().max(1024),
      type: z.literal("public-key"),
      response: z
        .object({
          clientDataJSON: z.string().max(4096),
          authenticatorData: z.string().max(4096),
          signature: z.string().max(1024),
          userHandle: z.string().max(512).optional()
        })
        .passthrough(),
      clientExtensionResults: z.record(z.unknown()).default({})
    })
    .passthrough()
});

/**
 * Finishes passkey sign-in and issues a session marked `authMethod: passkey`.
 * Every failure gives the same answer so the endpoint reveals nothing about accounts.
 */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const ip = getClientIp(req.headers);
  const rate = await checkRateLimit(`passkey-login:${ip}`, 20, 10 * 60 * 1000);
  if (!rate.success) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 16 * 1024 });
  if (!parsed.ok) return parsed.response;
  const { challengeId, response } = parsed.data;

  try {
    const expectedChallenge = await consumeChallenge(challengeId, "authenticate", null);
    if (!expectedChallenge) return NextResponse.json({ error: FAILED }, { status: 401 });

    const found = await findPasskey(response.id);
    if (!found || found.passkey.status !== "active") return NextResponse.json({ error: FAILED }, { status: 401 });

    const { rpID, origin } = getWebAuthnConfig(req);
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape checked above and by the library
        response: response as any,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: found.passkey.credentialId,
          publicKey: isoBase64URL.toBuffer(found.passkey.publicKey),
          counter: found.passkey.counter,
          transports: found.passkey.transports
        }
      });
    } catch {
      return NextResponse.json({ error: FAILED }, { status: 401 });
    }
    if (!verification.verified) return NextResponse.json({ error: FAILED }, { status: 401 });

    // The user handle, when sent, must belong to the same admin as the credential.
    const userHandle = response.response.userHandle;
    if (userHandle && new TextDecoder().decode(isoBase64URL.toBuffer(userHandle)) !== found.uid) {
      return NextResponse.json({ error: FAILED }, { status: 401 });
    }

    const admin = await getAdminProfile(COMMUNITY_SLUG, found.uid);
    if (!admin || admin.status !== "active") return NextResponse.json({ error: FAILED }, { status: 401 });

    await recordPasskeyUse(found.uid, found.passkey.credentialId, verification.authenticationInfo.newCounter);

    const customToken = await issueCustomToken(found.uid, "admin", "passkey");
    const idToken = await exchangeCustomTokenForIdToken(customToken);
    if (!idToken) return NextResponse.json({ error: "Unable to create session" }, { status: 500 });

    await getAdminDb().doc(orgAdminDocPath(COMMUNITY_SLUG, found.uid)).set({ lastLoginAt: Timestamp.now() }, { merge: true });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "login",
      actor: { uid: found.uid, adminId: admin.id, name: admin.name, email: admin.email, role: admin.roles[0] ?? "admin" },
      resource: { type: "admin_session", summary: `Passkey: ${found.passkey.name}` },
      meta: { ip, userAgent: req.headers.get("user-agent") ?? null, route: "/api/auth/passkey/login/verify" }
    });

    return await createSessionResponse(idToken, { ok: true });
  } catch (error) {
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
