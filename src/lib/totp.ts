import crypto from "node:crypto";

/**
 * Authenticator-app codes (RFC 6238 TOTP, HMAC-SHA1, 30 s steps, 6 digits), the second
 * sign-in factor next to passkeys (plan decision D6). Pure functions; the Firestore side
 * lives in totpStore.ts.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes from one step either side are accepted, to allow for clock drift. */
export const TOTP_WINDOW_STEPS = 1;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Not a valid base32 string");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random 160-bit secret. */
export function generateTotpSecret(): Buffer {
  return crypto.randomBytes(20);
}

export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpCode(secret: Uint8Array, nowMs: number, digits = TOTP_DIGITS): string {
  return hotp(secret, totpStep(nowMs), digits);
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** What people type: digits only, spaces allowed ("123 456"). Anything else is not a code. */
export function normalizeTotpInput(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(digits) ? digits : null;
}

/**
 * Returns the time step the code belongs to, or null when it is wrong. A step at or before
 * `lastUsedStep` is refused, so a code that was already used (or one older than the last one
 * used) can never sign in a second time.
 */
export function verifyTotp(secret: Uint8Array, input: string, nowMs: number, lastUsedStep = -1): number | null {
  const code = normalizeTotpInput(input);
  if (!code) return null;
  const current = totpStep(nowMs);
  let found: number | null = null;
  // Check every step in the window (no early exit) so timing does not reveal which one matched.
  for (let step = current - TOTP_WINDOW_STEPS; step <= current + TOTP_WINDOW_STEPS; step++) {
    if (sameText(hotp(secret, step), code) && step > lastUsedStep) found = step;
  }
  return found;
}

/** The URI an authenticator app reads from the QR code. */
export function otpauthUri(params: { secret: Uint8Array; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: base32Encode(params.secret),
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Groups of four for reading aloud or typing: "ABCD EFGH ...". */
export function formatSecretForDisplay(secret: Uint8Array): string {
  return base32Encode(secret).replace(/(.{4})/g, "$1 ").trim();
}

// ---------- encrypting the secret at rest ----------

export type EncryptedTotpSecret = { v: 1; kid: string; iv: string; ct: string; tag: string };

export function keyId(masterKey: Uint8Array): string {
  return crypto.createHash("sha256").update(masterKey).digest("hex").slice(0, 16);
}

/** A separate key per admin and purpose, derived from the server's master key. */
function deriveKey(masterKey: Uint8Array, uid: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, "ghmo-totp-salt", `ghmo:totp-secret:v1:${uid}`, 32));
}

export function encryptTotpSecret(secret: Uint8Array, masterKey: Uint8Array, uid: string): EncryptedTotpSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(masterKey, uid), iv);
  cipher.setAAD(Buffer.from(`ghmo:totp:${uid}`));
  const ct = Buffer.concat([cipher.update(secret), cipher.final()]);
  return {
    v: 1,
    kid: keyId(masterKey),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

/** Tries each key (current first, then previous ones kept for rotation) whose id matches. */
export function decryptTotpSecret(blob: EncryptedTotpSecret, masterKeys: Uint8Array[], uid: string): Buffer {
  const key = masterKeys.find(candidate => keyId(candidate) === blob.kid);
  if (!key) throw new Error("Unknown authenticator encryption key");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(key, uid), Buffer.from(blob.iv, "base64"));
  decipher.setAAD(Buffer.from(`ghmo:totp:${uid}`));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(blob.ct, "base64")), decipher.final()]);
}

// ---------- recovery codes ----------

export const RECOVERY_CODE_COUNT = 8;
// No 0/O/1/I so codes survive being read off paper.
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ten characters from a 32-symbol alphabet (50 bits), shown as "ABCDE-FGHJK". */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, byte => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{10}$/.test(clean) ? clean : null;
}

export function hashRecoveryCode(code: string, uid: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error("Not a recovery code");
  return crypto.createHash("sha256").update(`ghmo:recovery:v1:${uid}:${normalized}`).digest("hex");
}

/** Index of the matching unused hash, or -1. Compares every entry. */
export function findRecoveryCode(input: string, uid: string, hashes: string[]): number {
  const normalized = normalizeRecoveryCode(input);
  if (!normalized) return -1;
  const wanted = hashRecoveryCode(normalized, uid);
  let found = -1;
  hashes.forEach((hash, index) => {
    if (sameText(hash, wanted)) found = index;
  });
  return found;
}
