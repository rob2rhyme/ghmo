/**
 * Recovery key (plan §4.3, decision D1).
 *
 * The recovery key is the private half of a P-256 ECDH key pair. Its public half
 * is stored in the keyring, and every epoch's workspace key is wrapped to it, so
 * normal key rotation never needs the paper copy. Two trustees each keep a paper
 * copy. Without it, losing every admin device means losing all encrypted data.
 *
 * Printed format: 14 groups of 4 Crockford base32 characters (no I, L, O, U),
 * encoding the 32-byte private scalar plus a 2-byte checksum to catch typos.
 */
import { bytesEqual, concatBytes, toBase64Url, fromBase64Url } from "./encoding";
import { ECDH_PARAMS, exportPublicJwk, unwrapWithPrivateKey, wrapToPublicKey, type KeyWrap, type PublicJwk } from "./keys";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid character in recovery key");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function checksum(d: Uint8Array): Promise<Uint8Array> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", concatBytes(new TextEncoder().encode("ghmo-recovery/v1"), d)));
  return digest.slice(0, 2);
}

/** Human-entry normalisation: case, separators and look-alike letters. */
export function normalizeRecoveryKeyInput(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export async function formatRecoveryKey(d: Uint8Array): Promise<string> {
  if (d.length !== 32) throw new Error("Recovery key must be 32 bytes");
  const encoded = base32Encode(concatBytes(d, await checksum(d)));
  return encoded.match(/.{1,4}/g)!.join("-");
}

/** Parses a typed recovery key. Throws on typos (checksum) or wrong length. */
export async function parseRecoveryKey(text: string): Promise<Uint8Array> {
  const normalized = normalizeRecoveryKeyInput(text);
  if (normalized.length !== 55) throw new Error("A recovery key has 55 characters (14 groups)");
  const bytes = base32Decode(normalized).slice(0, 34);
  const d = bytes.slice(0, 32);
  if (!bytesEqual(bytes.slice(32, 34), await checksum(d))) {
    throw new Error("That recovery key has a typo. Check each group and try again.");
  }
  return d;
}

export type NewRecoveryKey = { printable: string; publicJwk: PublicJwk };

/** Creates a recovery key pair. Show `printable` once; store only `publicJwk`. */
export async function generateRecoveryKey(): Promise<NewRecoveryKey> {
  const pair = await globalThis.crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"]);
  const jwk = await globalThis.crypto.subtle.exportKey("jwk", pair.privateKey);
  const d = fromBase64Url(jwk.d!);
  return { printable: await formatRecoveryKey(d), publicJwk: await exportPublicJwk(pair.publicKey) };
}

/** Rebuilds the recovery private key from the paper copy and the stored public key. */
export async function importRecoveryPrivateKey(printable: string, publicJwk: PublicJwk): Promise<CryptoKey> {
  const d = await parseRecoveryKey(printable);
  try {
    return await globalThis.crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", d: toBase64Url(d), x: publicJwk.x, y: publicJwk.y },
      ECDH_PARAMS,
      false,
      ["deriveBits"]
    );
  } catch {
    // Some engines check that d matches (x, y) on import; others fail later at unwrap.
    throw new RecoveryKeyMismatchError();
  }
}

/**
 * The same paper key, as a signing key. Only used to sign the roster entry that approves a device
 * "by recovery key" (the entries are signed under their own prefix, so signatures can't be confused
 * with anything else this scalar does).
 */
export async function importRecoverySigningKey(printable: string, publicJwk: PublicJwk): Promise<CryptoKey> {
  const d = await parseRecoveryKey(printable);
  try {
    return await globalThis.crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", d: toBase64Url(d), x: publicJwk.x, y: publicJwk.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch {
    throw new RecoveryKeyMismatchError();
  }
}

export class RecoveryKeyMismatchError extends Error {
  constructor() {
    super("This recovery key doesn't belong to this workspace.");
    this.name = "RecoveryKeyMismatchError";
  }
}

/** Two random group positions the person must re-type to prove they copied the key. */
export function pickVerificationGroups(count = 2): number[] {
  const picks = new Set<number>();
  const random = new Uint32Array(8);
  globalThis.crypto.getRandomValues(random);
  for (const n of random) {
    picks.add(n % 14);
    if (picks.size === count) break;
  }
  return [...picks].sort((a, b) => a - b);
}

const RECOVERY_CHECK_CONTEXT = "ghmo-e2ee/recovery-check/v1";

/**
 * Proof-of-possession for the recovery key. A random token is wrapped to the
 * recovery public key; the server keeps only its SHA-256. Unwrapping the token
 * (possible only with the paper key) and sending it back proves possession, so a
 * device can be activated "by recovery key" without another admin.
 */
export async function createRecoveryCheck(recoveryPublic: PublicJwk) {
  const token = new Uint8Array(32);
  globalThis.crypto.getRandomValues(token);
  const wrap = await wrapToPublicKey(token, recoveryPublic, RECOVERY_CHECK_CONTEXT);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", token));
  return { wrap, tokenHash: [...digest].map(b => b.toString(16).padStart(2, "0")).join("") };
}

/** Answers the recovery check with the recovery private key (returns the token, base64url). */
export async function answerRecoveryCheck(wrap: KeyWrap, recoveryPrivate: CryptoKey): Promise<string> {
  return toBase64Url(await unwrapWithPrivateKey(wrap, recoveryPrivate, RECOVERY_CHECK_CONTEXT));
}
