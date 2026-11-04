//src/lib/admin.ts
import { cache } from "react";
import { NextRequest } from "next/server";
import { getAdminDb } from "./firebaseAdmin";
import { AuthContext, AuthMethod, getAuthContextFromRequest } from "./auth";
import { isDevLoginAllowed } from "./security/devLogin";
import { COMMUNITY_SLUG } from "./community";
import { orgAdminDocPath, orgAdminsCollectionPath } from "./firestorePaths";
export type AdminProfile = {
  id: string;
  name: string;
  emailLower: string;
  email?: string;
  roles: string[];
  status: "active" | "disabled";
  createdAt?: Date;
  createdBy?: string;
  lastLoginAt?: Date;
  lastLogoutAt?: Date;
  authUid?: string;
};

export type AdminActor = {
  uid: string;
  email?: string;
  emailLower?: string;
  name?: string;
  roles: string[];
  adminDocId: string;
};

export class AdminAccessError extends Error {
  constructor(public status: number, message: string, public reason?: string) {
    super(message);
    this.name = "AdminAccessError";
  }
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return undefined;
}

function mapAdminDoc(id: string, data: Record<string, unknown>): AdminProfile {
  return {
    id,
    name: (data.name as string) ?? "Unnamed Admin",
    emailLower: (data.emailLower as string) ?? "",
    email: data.email as string | undefined,
    roles: Array.isArray(data.roles) ? (data.roles as string[]) : [],
    status: (data.status as "active" | "disabled") ?? "disabled",
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy as string | undefined,
    lastLoginAt: toDate(data.lastLoginAt),
    lastLogoutAt: toDate(data.lastLogoutAt),
    authUid: data.authUid as string | undefined
  };
}

type AdminAuthInput = NextRequest | AuthContext | undefined;

function isNextRequest(value: AdminAuthInput): value is NextRequest {
  return Boolean(value && typeof (value as NextRequest).headers?.get === "function");
}

/**
 * True when the session counts as strong admin authentication: a passkey sign-in, an
 * authenticator-app code after the email link (D6), or the local dev bypass outside production.
 */
export function isStrongAdminAuth(authMethod: AuthMethod | null): boolean {
  if (authMethod === "passkey" || authMethod === "totp") return true;
  return authMethod === "dev" && isDevLoginAllowed(process.env);
}

type RequireAdminOptions = {
  /**
   * Accept a magic-link session. Only for passkey setup/recovery, sign-out and
   * session status. Everything else requires a passkey session (plan D2).
   */
  allowMagicLink?: boolean;
};

/**
 * The cookie session and its admin record, read once per server render: the admin layout and the page
 * both call requireActiveAdmin(), and without this each would verify the cookie with Google and read
 * the admin record again. React's cache() lasts for one request only; route handlers pass the request
 * and are not memoized.
 */
async function readAdminDoc(orgSlug: string, uid: string) {
  const doc = await getAdminDb().doc(orgAdminDocPath(orgSlug, uid)).get();
  return doc.exists ? { id: doc.id, data: doc.data() as Record<string, unknown> } : null;
}

const sessionAdminForRender = cache(async (orgSlug: string) => {
  const ctx = await getAuthContextFromRequest();
  // undefined: not looked up (no session, or another organization); null: looked up and missing.
  const adminDoc = ctx?.orgSlug === orgSlug ? await readAdminDoc(orgSlug, ctx.uid) : undefined;
  return { ctx, adminDoc };
});

export async function requireActiveAdmin(
  input?: AdminAuthInput,
  orgSlug: string = COMMUNITY_SLUG,
  options: RequireAdminOptions = {}
) {
  const render = input === undefined ? await sessionAdminForRender(orgSlug) : null;
  const ctx: AuthContext | null = render ? render.ctx : isNextRequest(input) ? await getAuthContextFromRequest(input) : (input ?? null);

  // Defense in depth on top of SameSite cookies: a browser says when a request was started by another site.
  if (isNextRequest(input) && !["GET", "HEAD", "OPTIONS"].includes(input.method)) {
    const site = input.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      throw new AdminAccessError(403, "This request came from another website, so it was refused. Open the page from the GHMO site and try again.", "CROSS_SITE");
    }
  }

  if (!ctx) throw new AdminAccessError(401, "Your sign-in has ended. Sign in again, then try once more.", "NO_CONTEXT");
  if (!ctx.orgSlug) throw new AdminAccessError(403, "This sign-in isn't for the GHMO admin area. Sign in again.", "ORGSLUG_MISSING");
  if (ctx.orgSlug !== orgSlug) throw new AdminAccessError(403, "This sign-in isn't for the GHMO admin area. Sign in again.", "ORGSLUG_MISMATCH");
  const adminDoc = render?.adminDoc !== undefined ? render.adminDoc : await readAdminDoc(orgSlug, ctx.uid);
  if (!adminDoc) throw new AdminAccessError(403, "This account isn't on the admin list. Ask a super admin to add you.", "ADMIN_DOC_NOT_FOUND");
  const profile = mapAdminDoc(adminDoc.id, adminDoc.data);
  if (profile.status !== "active")
    throw new AdminAccessError(403, "This admin account is turned off. Ask a super admin if you need access again.", "ADMIN_INACTIVE");
  if (!isStrongAdminAuth(ctx.authMethod) && !options.allowMagicLink) {
    throw new AdminAccessError(403, "Finish signing in with your authenticator app or passkey to continue.", "PASSKEY_REQUIRED");
  }

  const actor: AdminActor = {
    uid: ctx.uid,
    email: profile.email ?? ctx.email,
    emailLower: profile.emailLower || ctx.emailLower,
    name: profile.name,
    roles: profile.roles,
    adminDocId: profile.id
  };

  return { actor, admin: profile, authMethod: ctx.authMethod, sessionExpiresAt: ctx.expiresAt };
}

export async function getAdminProfile(orgSlug: string, adminId: string) {
  const doc = await getAdminDb().doc(orgAdminDocPath(orgSlug, adminId)).get();
  if (!doc.exists) return null;
  return mapAdminDoc(doc.id, doc.data() as Record<string, unknown>);
}

export async function listAdmins(orgSlug: string) {
  // No orderBy: Firestore silently drops documents that lack the sort field
  // (e.g. admins added by hand in the console). Sort in memory instead.
  const snapshot = await getAdminDb().collection(orgAdminsCollectionPath(orgSlug)).get();
  return snapshot.docs
    .map(doc => mapAdminDoc(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}

export function isSuperAdmin(admin: AdminProfile) {
  return admin.roles.includes("super_admin");
}

export async function requireSuperAdmin(req?: NextRequest, orgSlug: string = COMMUNITY_SLUG) {
  const { actor, admin } = await requireActiveAdmin(req, orgSlug);
  if (!isSuperAdmin(admin)) {
    throw new AdminAccessError(403, "Only a super admin can do this.", "NOT_SUPER_ADMIN");
  }
  return { actor, admin };
}
