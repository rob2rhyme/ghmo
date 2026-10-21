import crypto from "node:crypto";

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so neither the content nor the length of the secret leaks via timing.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}
