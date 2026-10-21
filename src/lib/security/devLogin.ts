const MIN_TOKEN_LENGTH = 32;

/**
 * The dev admin-session bypass (plan S-20) is allowed only when ALL hold:
 * - not a production build or deployment,
 * - ALLOW_DEV_ADMIN_LOGIN=true,
 * - DEV_ADMIN_LOGIN_TOKEN is set and at least 32 characters.
 */
export function isDevLoginAllowed(env: Record<string, string | undefined>): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production" || env.APP_ENV === "production" || env.APP_ENV === "prod") return false;
  if (env.ALLOW_DEV_ADMIN_LOGIN !== "true") return false;
  const token = env.DEV_ADMIN_LOGIN_TOKEN?.trim() ?? "";
  return token.length >= MIN_TOKEN_LENGTH;
}
