/**
 * Passkeys belong to one domain (the WebAuthn "RP ID"), taken from NEXT_PUBLIC_APP_URL. If the site is
 * opened at a different address, the browser refuses with a cryptic "The RP ID ... is invalid for this
 * domain". This detects that case so the server can say what is wrong in plain words.
 */

function hostnameOf(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
}

/** The address the visitor used, from the proxy-provided headers. */
export function requestHostname(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0];
  const host = forwarded || headers.get("host");
  return host ? hostnameOf(host) : null;
}

/**
 * Returns a plain-language message when the visitor is on a different address than the one
 * passkeys are set up for, or null when they match (or nothing is configured to compare).
 */
export function wrongAddressMessage(configuredOrigin: string | undefined, headers: Pick<Headers, "get">): string | null {
  if (!configuredOrigin) return null;
  let expected: string;
  try {
    expected = new URL(configuredOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
  const actual = requestHostname(headers);
  if (!actual || actual === expected) return null;
  return `Passkeys on this site are set up for ${expected}, but you opened ${actual}. Open https://${expected} and try again. If ${actual} should be the address, the site owner needs to set NEXT_PUBLIC_APP_URL to it.`;
}
