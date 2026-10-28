import crypto from "node:crypto";

/**
 * Verifies a Svix-style webhook signature (the scheme Resend uses). The signed text is
 * `${id}.${timestamp}.${body}`, signed with HMAC-SHA256 under the base64 secret (after `whsec_`).
 * The header holds one or more space-separated `v1,<base64>` entries. Old timestamps are refused so a
 * captured request cannot be replayed later.
 */
export function verifySvixSignature(params: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const { id, timestamp, signature, body, secret } = params;
  if (!id || !timestamp || !signature || !secret) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = (params.nowMs ?? Date.now()) / 1000;
  if (Math.abs(now - seconds) > (params.toleranceSeconds ?? 300)) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signature.split(" ").some(part => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
