import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";
import { AdminAccessError, isStrongAdminAuth, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { consumeChallenge, decideNewPasskeyStatus, getWebAuthnConfig, storePasskey } from "@/src/lib/passkeys";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  challengeId: z.string().min(16).max(64),
  name: z.string().trim().min(1).max(60).optional(),
  // Validated structurally by @simplewebauthn/server.
  response: z
    .object({
      id: z.string().max(1024),
      rawId: z.string().max(1024),
      type: z.literal("public-key"),
      response: z.object({ clientDataJSON: z.string().max(4096), attestationObject: z.string().max(16384) }).passthrough(),
      clientExtensionResults: z.record(z.string(), z.unknown()).default({})
    })
    .passthrough()
});

export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin, authMethod } = await requireActiveAdmin(req, COMMUNITY_SLUG, { allowMagicLink: true });
    const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 32 * 1024 });
    if (!parsed.ok) return parsed.response;
    const { challengeId, name, response } = parsed.data;

    const expectedChallenge = await consumeChallenge(challengeId, "register", actor.uid);
    if (!expectedChallenge) return NextResponse.json({ error: "Registration expired. Try again." }, { status: 400 });

    const { rpID, origin } = getWebAuthnConfig(req);
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape checked above and by the library
        response: response as any,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true
      });
    } catch {
      return NextResponse.json({ error: "Passkey could not be verified" }, { status: 400 });
    }
    if (!verification.verified) return NextResponse.json({ error: "Passkey could not be verified" }, { status: 400 });

    const info = verification.registrationInfo;
    const via = isStrongAdminAuth(authMethod) ? "passkey" : "magic_link";
    const status = await decideNewPasskeyStatus(actor.uid, via);
    const prf = (response.clientExtensionResults as { prf?: { enabled?: boolean } }).prf;

    await storePasskey(actor.uid, {
      credentialId: info.credential.id,
      publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      prfEnabled: prf?.enabled === true,
      name: name ?? "Passkey",
      status,
      createdVia: via,
      approvedBy: null,
      approvedAt: null
    });

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: status === "active" ? "passkey_registered" : "passkey_pending_approval",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "passkey", id: info.credential.id, summary: `${name ?? "Passkey"} (${via})` },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: "/api/auth/passkey/register/verify" }
    });

    return NextResponse.json({ ok: true, status, prfEnabled: prf?.enabled === true });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
