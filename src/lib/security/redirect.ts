/**
 * Returns `candidate` only if it is a same-origin path; otherwise `fallback`.
 * Blocks open redirects such as "//evil.com", "/\\evil.com", "https://evil.com"
 * and "javascript:" URLs.
 */
export function safeRedirectPath<T extends string>(candidate: string | null | undefined, fallback: T): string | T {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  try {
    const base = "https://same-origin.invalid";
    const url = new URL(candidate, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
