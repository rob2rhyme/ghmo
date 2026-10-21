//src/lib/admin.ts
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "./firebaseAdmin";
import { AuthContext, getAuthContextFromRequest, SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK } from "./auth";
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

export async function requireActiveAdmin(input?: AdminAuthInput, orgSlug: string = COMMUNITY_SLUG) {
  let ctx: AuthContext | null = null;
  let cookieName: string | null = null;

  if (isNextRequest(input)) {
    ctx = await getAuthContextFromRequest(input);
    cookieName = input.cookies.get(SESSION_COOKIE_NAME) ? SESSION_COOKIE_NAME : input.cookies.get(SESSION_COOKIE_NAME_FALLBACK) ? SESSION_COOKIE_NAME_FALLBACK : null;
  } else {
    ctx = input ?? null;
    if (!ctx) {
      ctx = await getAuthContextFromRequest();
    }
    const cookieStore = await cookies();
    cookieName = cookieStore.get(SESSION_COOKIE_NAME) ? SESSION_COOKIE_NAME : cookieStore.get(SESSION_COOKIE_NAME_FALLBACK) ? SESSION_COOKIE_NAME_FALLBACK : null;
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("requireActiveAdmin resolving context", {
      orgSlug,
      cookieUsed: cookieName,
      hasContext: Boolean(ctx),
      ctx: ctx
        ? { uid: ctx.uid, orgSlug: ctx.orgSlug, role: ctx.role, emailLower: ctx.emailLower }
        : null
    });
  }

  if (!ctx) throw new AdminAccessError(401, "Unauthorized", "NO_CONTEXT");
  if (!ctx.orgSlug) throw new AdminAccessError(403, "Organization missing", "ORGSLUG_MISSING");
  if (ctx.orgSlug !== orgSlug) throw new AdminAccessError(403, "Organization mismatch", "ORGSLUG_MISMATCH");
  const docPath = orgAdminDocPath(orgSlug, ctx.uid);
  console.debug("requireActiveAdmin checking doc", { docPath, uid: ctx.uid });
  const doc = await getAdminDb().doc(docPath).get();
  if (!doc || !doc.exists) throw new AdminAccessError(403, "Admin profile not found", "ADMIN_DOC_NOT_FOUND");
  const profile = mapAdminDoc(doc.id, doc.data() as Record<string, unknown>);
  if (profile.status !== "active")
    throw new AdminAccessError(403, "Admin is disabled", "ADMIN_INACTIVE");

  const actor: AdminActor = {
    uid: ctx.uid,
    email: profile.email ?? ctx.email,
    emailLower: profile.emailLower || ctx.emailLower,
    name: profile.name,
    roles: profile.roles,
    adminDocId: profile.id
  };

  return { actor, admin: profile };
}

export async function getAdminProfile(orgSlug: string, adminId: string) {
  const doc = await getAdminDb().doc(orgAdminDocPath(orgSlug, adminId)).get();
  if (!doc.exists) return null;
  return mapAdminDoc(doc.id, doc.data() as Record<string, unknown>);
}

export async function listAdmins(orgSlug: string) {
  const snapshot = await getAdminDb()
    .collection(orgAdminsCollectionPath(orgSlug))
    .orderBy("createdAt", "asc")
    .get();
  return snapshot.docs.map(doc => mapAdminDoc(doc.id, doc.data() as Record<string, unknown>));
}

export function isSuperAdmin(admin: AdminProfile) {
  return admin.roles.includes("super_admin");
}

export async function requireSuperAdmin(req?: NextRequest, orgSlug: string = COMMUNITY_SLUG) {
  const { actor, admin } = await requireActiveAdmin(req, orgSlug);
  if (!isSuperAdmin(admin)) {
    throw new AdminAccessError(403, "Super admin required", "NOT_SUPER_ADMIN");
  }
  return { actor, admin };
}
