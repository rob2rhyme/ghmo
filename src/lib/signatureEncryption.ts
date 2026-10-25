import "server-only";

import crypto from "crypto";

/**
 * Server-side encryption for collected signatures (interim until plan Phase 4
 * moves signatures to end-to-end encryption).
 *
 * v2 payloads (S-11):
 * - `kid` identifies the key (first 16 hex chars of its SHA-256), so keys can rotate:
 *   put the new key in DOCGEN_SIGNATURE_ENC_KEY_BASE64 and old ones, comma-separated,
 *   in DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64.
 * - Additional authenticated data binds the ciphertext to its signing session, so it
 *   cannot be copied onto another session.
 * v1 payloads (no kid, no AAD) still decrypt with the current key.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedSignature = {
  alg: "AES-256-GCM";
  v?: 2;
  kid?: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

function decodeKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes`);
  }
  return key;
}

function keyId(key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function currentKey(): Buffer {
  const raw = process.env.DOCGEN_SIGNATURE_ENC_KEY_BASE64;
  if (!raw) {
    throw new Error("DOCGEN_SIGNATURE_ENC_KEY_BASE64 is not set");
  }
  return decodeKey(raw, "DOCGEN_SIGNATURE_ENC_KEY_BASE64");
}

function keyById(kid: string): Buffer {
  const current = currentKey();
  if (keyId(current) === kid) return current;
  const previous = (process.env.DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64 ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => decodeKey(part, "DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64"));
  const match = previous.find(key => keyId(key) === kid);
  if (!match) throw new Error("Unknown signature encryption key");
  return match;
}

/**
 * The server's data-encryption keys, current first then any previous ones kept for rotation.
 * Other server-side secrets (such as authenticator-app seeds) derive their own keys from these.
 */
export function serverEncryptionKeys(): Buffer[] {
  const previous = (process.env.DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64 ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => decodeKey(part, "DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64"));
  return [currentKey(), ...previous];
}

function aad(sessionId: string): Buffer {
  return Buffer.from(`ghmo:signature:v2:${sessionId}`, "utf8");
}

export function encryptSignature(bytes: Buffer, sessionId: string): EncryptedSignature {
  const key = currentKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(sessionId));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    alg: "AES-256-GCM",
    v: 2,
    kid: keyId(key),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptSignature(payload: EncryptedSignature, sessionId: string): Buffer {
  if (payload.alg !== "AES-256-GCM") {
    throw new Error("Unsupported signature encryption algorithm");
  }
  const isV2 = payload.v === 2;
  const key = isV2 && payload.kid ? keyById(payload.kid) : currentKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  if (isV2) decipher.setAAD(aad(sessionId));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
}

export const MAX_SIGNATURE_BYTES = 200 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Parses a PNG data URL, rejecting anything that is not a real, reasonably sized PNG. */
export function parsePngDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Signature must be a PNG data URL");
  }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature image is too large");
  }
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error("Signature must be a PNG image");
  }
  return bytes;
}

export function toPngDataUrl(bytes: Buffer) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** Signing session IDs are 32 random bytes in hex. Anything else is rejected before touching Firestore. */
export function isValidSigningSessionId(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
