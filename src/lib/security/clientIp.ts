/**
 * Best-effort client IP for rate limiting and audit logs.
 *
 * Clients can send their own X-Forwarded-For, and proxies APPEND to it, so the
 * left-most entry is attacker-controlled. We read from the right instead:
 * - On Vercel, `x-real-ip` is set by the platform and cannot be spoofed.
 * - Elsewhere, take the entry added by our own proxy: TRUSTED_PROXY_HOPS
 *   (default 1) counts proxies from the right that we trust to append.
 *
 * Rate limits also key on the account/email, so a wrong IP never disables them.
 */
export function getClientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL) {
    const vercelIp = headers.get("x-real-ip")?.trim();
    if (vercelIp) return vercelIp;
  }

  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map(part => part.trim())
    .filter(Boolean);
  if (forwarded && forwarded.length > 0) {
    const hops = Math.max(1, Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
    const index = Math.max(0, forwarded.length - hops);
    return forwarded[index];
  }

  return "unknown";
}
