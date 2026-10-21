/**
 * Encrypted record envelope (plan §4.2). Stored in Firestore in place of the
 * plaintext fields of an end-to-end-encrypted document.
 *
 * - AES-256-GCM under the epoch's workspace key.
 * - AAD binds the ciphertext to its exact location, epoch and writing device,
 *   so it cannot be copied to another document or replayed under another epoch.
 * - ECDSA signature by the writing device, so readers know which enrolled device
 *   wrote it (the server cannot forge or alter records).
 */
import { concatBytes, fromBase64Url, fromUtf8, utf8 } from "./encoding";
import { openBytes, sealBytes, signBytes, verifyBytes, type PublicJwk } from "./keys";

export type Envelope = {
  v: 1;
  epoch: number;
  dev: string;
  iv: string;
  ct: string;
  sig: string;
};

export type RecordLocation = { path: string; docId: string };

function aadFor(location: RecordLocation, epoch: number, deviceId: string) {
  if (!location.path || !location.docId || location.path.includes("|") || location.docId.includes("|")) {
    throw new Error("Invalid record location");
  }
  return utf8(`ghmo-e2ee/record/v1|${location.path}|${location.docId}|${epoch}|${deviceId}`);
}

function signedBytes(aad: Uint8Array<ArrayBuffer>, iv: string, ct: string) {
  return concatBytes(aad, fromBase64Url(iv), fromBase64Url(ct));
}

export async function encryptRecord(params: {
  data: unknown;
  location: RecordLocation;
  epoch: number;
  workspaceKey: CryptoKey;
  deviceId: string;
  signingKey: CryptoKey;
}): Promise<Envelope> {
  const aad = aadFor(params.location, params.epoch, params.deviceId);
  const sealed = await sealBytes(params.workspaceKey, utf8(JSON.stringify(params.data)), aad);
  const sig = await signBytes(params.signingKey, signedBytes(aad, sealed.iv, sealed.ct));
  return { v: 1, epoch: params.epoch, dev: params.deviceId, iv: sealed.iv, ct: sealed.ct, sig };
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

export function isEnvelope(value: unknown): value is Envelope {
  const v = value as Partial<Envelope> | null;
  return (
    !!v &&
    v.v === 1 &&
    Number.isInteger(v.epoch) &&
    typeof v.dev === "string" &&
    typeof v.iv === "string" &&
    typeof v.ct === "string" &&
    typeof v.sig === "string"
  );
}

/**
 * Verifies the signature, then decrypts. `signingKeyFor` must return the public
 * signing key of an enrolled device (or null if unknown); `workspaceKeyFor`
 * returns the workspace key of the envelope's epoch (or null if not available).
 */
export async function decryptRecord<T = unknown>(
  envelope: unknown,
  location: RecordLocation,
  keys: {
    workspaceKeyFor: (epoch: number) => Promise<CryptoKey | null> | CryptoKey | null;
    signingKeyFor: (deviceId: string) => Promise<PublicJwk | null> | PublicJwk | null;
  }
): Promise<T> {
  if (!isEnvelope(envelope)) throw new EnvelopeError("Not an encrypted record");
  const signer = await keys.signingKeyFor(envelope.dev);
  if (!signer) throw new EnvelopeError("Written by an unknown device");
  const aad = aadFor(location, envelope.epoch, envelope.dev);
  if (!(await verifyBytes(signer, envelope.sig, signedBytes(aad, envelope.iv, envelope.ct)))) {
    throw new EnvelopeError("Signature check failed");
  }
  const wdk = await keys.workspaceKeyFor(envelope.epoch);
  if (!wdk) throw new EnvelopeError(`No key for epoch ${envelope.epoch} on this device`);
  try {
    return JSON.parse(fromUtf8(await openBytes(wdk, envelope, aad))) as T;
  } catch {
    throw new EnvelopeError("Could not decrypt record");
  }
}
