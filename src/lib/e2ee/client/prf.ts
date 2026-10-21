/**
 * WebAuthn PRF: derives a stable secret from a passkey (plan §4.2). The same
 * passkey + salt always gives the same 32 bytes, and only with the user's
 * fingerprint/face/PIN. That secret unlocks this device's E2EE keys.
 */
import { fromBase64Url, randomBytes, toBase64Url } from "../encoding";

type PrfResult = { output: Uint8Array<ArrayBuffer>; credentialId: string };

type PrfExtensionResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

export class PrfUnavailableError extends Error {
  constructor() {
    super("This passkey can't unlock encryption keys (no PRF support). Use a passphrase instead.");
    this.name = "PrfUnavailableError";
  }
}

/**
 * Asks for a passkey and evaluates PRF with `salt`. When `credentialId` is given,
 * only that passkey is offered (unlock); otherwise the person picks one (setup).
 * The challenge is local and unverified: this assertion is never sent to a server.
 */
export async function evaluatePrf(params: { salt: Uint8Array<ArrayBuffer>; credentialId?: string; rpId: string }): Promise<PrfResult> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: params.rpId,
      userVerification: "required",
      timeout: 60_000,
      allowCredentials: params.credentialId ? [{ type: "public-key", id: fromBase64Url(params.credentialId) }] : [],
      extensions: { prf: { eval: { first: params.salt } } } as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was used");
  const results = credential.getClientExtensionResults() as PrfExtensionResults;
  const first = results.prf?.results?.first;
  if (!first) throw new PrfUnavailableError();
  return { output: new Uint8Array(first) as Uint8Array<ArrayBuffer>, credentialId: toBase64Url(new Uint8Array(credential.rawId)) };
}
