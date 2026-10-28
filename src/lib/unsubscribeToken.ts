import crypto from "node:crypto";

/**
 * Signed unsubscribe tokens (plan §10.3). A token proves that the link came from us for one member, so
 * the public unsubscribe route needs no login. They do not expire: an old email must still work (US law
 * requires at least 30 days, and people unsubscribe from old messages). They do nothing except opt a
 * member out, so a leaked token can only stop that person's email.
 *
 * token = `${memberId}.${base64url(HMAC-SHA256(derivedKey, "unsubscribe:v1:" + memberId))}`
 * The key is derived (HKDF) from the server master key, with a purpose label, so it is not the same
 * key that protects signatures or authenticator seeds.
 */
const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function deriveKey(masterKey: Uint8Array): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, "ghmo-unsubscribe-salt", "ghmo:unsubscribe-token:v1", 32));
}

function mac(memberId: string, masterKey: Uint8Array): Buffer {
  return crypto.createHmac("sha256", deriveKey(masterKey)).update(`unsubscribe:v1:${memberId}`).digest();
}

export function signUnsubscribeToken(memberId: string, masterKeys: Uint8Array[]): string {
  if (!MEMBER_ID_PATTERN.test(memberId)) throw new Error("Invalid member id");
  if (masterKeys.length === 0) throw new Error("No signing key");
  return `${memberId}.${mac(memberId, masterKeys[0]).toString("base64url")}`;
}

/** Returns the member id when the token is genuine for any current or previous key, otherwise null. */
export function verifyUnsubscribeToken(token: unknown, masterKeys: Uint8Array[]): string | null {
  if (typeof token !== "string" || token.length > 300) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const memberId = token.slice(0, dot);
  if (!MEMBER_ID_PATTERN.test(memberId)) return null;
  let given: Buffer;
  try {
    given = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return null;
  }
  for (const key of masterKeys) {
    const expected = mac(memberId, key);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return memberId;
  }
  return null;
}
