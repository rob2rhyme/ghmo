import { redirect } from "next/navigation";
import type { Route } from "next";
import { AdminAccessError, getAdminProfile, requireActiveAdmin } from "@/src/lib/admin";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";
import { listPasskeys } from "@/src/lib/passkeys";
import { isDevLoginAllowed } from "@/src/lib/security/devLogin";
import { safeRedirectPath } from "@/src/lib/security/redirect";
import AdminLoginClient, { type LoginStage } from "./AdminLoginClient";

type AdminLoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * Admin sign-in. The stage is decided here from the session:
 * - no session                    -> "signin" (passkey, or email link for setup/recovery)
 * - magic-link session            -> "setup" (create a passkey), or "pending" if a new
 *                                    passkey is waiting for another admin's approval
 * - passkey session               -> straight to the admin area
 */
export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(typeof next === "string" ? next : null, "/admin");

  let stage: LoginStage = "signin";
  let adminName: string | null = null;

  if (getAdminEnvStatus().ok) {
    const ctx = await getAuthContextFromRequest();
    if (ctx) {
      let signedInAdmin = false;
      try {
        await requireActiveAdmin(ctx, COMMUNITY_SLUG);
        signedInAdmin = true;
      } catch (error) {
        if (error instanceof AdminAccessError) {
          if (error.reason === "PASSKEY_REQUIRED") {
            try {
              const [passkeys, profile] = await Promise.all([listPasskeys(ctx.uid), getAdminProfile(COMMUNITY_SLUG, ctx.uid)]);
              stage = passkeys.some(p => p.status === "pending") ? "pending" : "setup";
              adminName = profile?.name ?? null;
            } catch (lookupError) {
              // Show the sign-in options instead of a blank error page, and leave the cause in the server log.
              console.error("Admin login: could not load passkey status", lookupError);
            }
          }
        } else {
          console.error("Admin login: could not check the current session", error);
        }
      }
      // Outside the try block: redirect() works by throwing.
      if (signedInAdmin) redirect(nextPath as Route);
    }
  }

  return (
    <AdminLoginClient
      orgSlug={COMMUNITY_SLUG}
      stage={stage}
      nextPath={nextPath}
      adminName={adminName}
      featureEmailLogin={getServerEnv().FEATURE_EMAIL_ADMIN_LOGIN}
      devLoginAvailable={isDevLoginAllowed(process.env)}
    />
  );
}
