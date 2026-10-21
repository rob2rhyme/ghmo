/**
 * Content-Security-Policy builders. Pure functions so they can be unit-tested.
 *
 * Secure areas (admin, login, member, signing, docs) get a strict nonce-based policy:
 * only scripts stamped with this request's nonce, or loaded by them ('strict-dynamic'),
 * may run. Public pages embed GoFundMe and social media, which load scripts from origins
 * we do not control, so they get a baseline policy instead. Public and secure pages use
 * separate root layouts, so public scripts never carry over into secure pages.
 */

const SECURE_PREFIXES = ["/admin", "/login", "/sign", "/c/", "/docs"] as const;

export function isSecurePath(pathname: string): boolean {
  return SECURE_PREFIXES.some(prefix => {
    if (prefix.endsWith("/")) return pathname.startsWith(prefix);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type SecureCspOptions = {
  nonce: string;
  isDev: boolean;
  upgradeInsecure: boolean;
  firebaseAuthDomain?: string;
  /** Tests only: allow the local Firebase emulators (never set in production). */
  allowEmulators?: boolean;
};

function join(directives: Array<string | false>): string {
  return directives.filter(Boolean).join("; ");
}

export function buildSecureCsp({ nonce, isDev, upgradeInsecure, firebaseAuthDomain, allowEmulators }: SecureCspOptions): string {
  const authFrame = firebaseAuthDomain ? ` https://${firebaseAuthDomain}` : "";
  return join([
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline styles are used by the letterhead/document previews. Style injection
    // cannot run code, so this is an accepted trade-off.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com" +
      (isDev ? " ws: http://localhost:*" : "") +
      (allowEmulators ? " http://127.0.0.1:8080 http://127.0.0.1:9099 http://localhost:8080 http://localhost:9099" : ""),
    `frame-src 'self' blob:${authFrame}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    upgradeInsecure && "upgrade-insecure-requests"
  ]);
}

export function buildPublicCsp({ upgradeInsecure }: { upgradeInsecure: boolean }): string {
  return join([
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    upgradeInsecure && "upgrade-insecure-requests"
  ]);
}
