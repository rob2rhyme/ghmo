import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { orgMembersCollectionPath } from "./firestorePaths";
import { normalizeMemberEmail } from "./members";

export type Role = "member" | "admin";

/**
 * How the session was created (custom-token claim `authMethod`, copied into the session cookie).
 * - passkey: WebAuthn sign-in. Required for admin access (plan decision D2).
 * - magic_link: email link. Only good for setting up or recovering a passkey.
 * - dev: local dev bypass (never in production).
 */
export type AuthMethod = "passkey" | "magic_link" | "dev";

/**
 * The only session cookie. Firebase Hosting forwards only a cookie named `__session`.
 * Its value is a Firebase *session cookie* (revocable), never a raw ID token.
 */
export const SESSION_COOKIE_NAME = "__session";
/** Pre-Phase-1 cookie that held a raw ID token. Only ever cleared, never read. */
export const LEGACY_SESSION_COOKIE_NAME = "sessionToken";

export async function issueCustomToken(uid: string, role: Role, authMethod: AuthMethod) {
  const admin = role === "admin";
  return getAdminAuth().createCustomToken(uid, { orgSlug: COMMUNITY_SLUG, role, admin, authMethod });
}

/** Verifies a Firebase ID token, rejecting tokens of users whose sessions were revoked. */
export async function verifyIdToken(idToken: string) {
  return getAdminAuth().verifyIdToken(idToken, true);
}

export type AuthContext = {
  uid: string;
  orgSlug: string;
  role: Role;
  authMethod: AuthMethod | null;
  email?: string;
  emailLower?: string;
};

export type MemberAuthContext = {
  uid: string;
  communityId: string;
  emailLower: string;
  email?: string;
  memberId: string;
  roles?: string[];
};

type RequestCredential = { kind: "bearer" | "cookie"; token: string };

async function extractCredential(req?: NextRequest): Promise<RequestCredential | null> {
  const authHeader = req ? req.headers.get("authorization") : (await headers()).get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return { kind: "bearer", token: bearer };
  const cookie = req ? req.cookies.get(SESSION_COOKIE_NAME)?.value : (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (cookie) return { kind: "cookie", token: cookie };
  return null;
}

/**
 * Decodes the request's credential. Session cookies and bearer ID tokens are both
 * checked for revocation, so logout and admin removal take effect immediately.
 * Returns null on any failure.
 */
export async function decodeRequestCredential(req?: NextRequest): Promise<DecodedIdToken | null> {
  const credential = await extractCredential(req);
  if (!credential) return null;
  try {
    const auth = getAdminAuth();
    return credential.kind === "cookie"
      ? await auth.verifySessionCookie(credential.token, true)
      : await auth.verifyIdToken(credential.token, true);
  } catch {
    return null;
  }
}

function toAuthContext(decoded: DecodedIdToken): AuthContext | null {
  const claims = decoded as DecodedIdToken & { orgSlug?: string; communityId?: string; orgId?: string; role?: Role; authMethod?: string };
  const orgSlug = claims.orgSlug || claims.communityId || claims.orgId;
  const role = claims.role;
  if (!orgSlug || !role || orgSlug !== COMMUNITY_SLUG) return null;
  return {
    uid: decoded.uid,
    orgSlug,
    role,
    authMethod:
      claims.authMethod === "passkey" || claims.authMethod === "magic_link" || claims.authMethod === "dev"
        ? claims.authMethod
        : null,
    email: decoded.email,
    emailLower: normalizeMemberEmail(decoded.email)
  };
}

export async function getAuthContextFromRequest(req?: NextRequest): Promise<AuthContext | null> {
  const decoded = await decodeRequestCredential(req);
  return decoded ? toAuthContext(decoded) : null;
}

export async function assertCommunityRole(requiredRole: Role) {
  const ctx = await getAuthContextFromRequest();
  if (!ctx) return null;
  if (requiredRole === "admin" && ctx.role !== "admin") return null;
  return ctx;
}

export async function assertAuthenticated(req?: NextRequest): Promise<MemberAuthContext | AuthContext | null> {
  const member = await assertMember(req);
  if (member) return member;
  return assertCommunityRole("admin");
}

/** Returns the active member record for a verified Firebase user, or null. */
export async function findActiveMember(decoded: Pick<DecodedIdToken, "uid" | "email">): Promise<MemberAuthContext | null> {
  const emailLower = normalizeMemberEmail(decoded.email);
  if (!emailLower) return null;
  const memberSnap = await getAdminDb()
    .collection(orgMembersCollectionPath(COMMUNITY_SLUG))
    .where("emailLower", "==", emailLower)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (memberSnap.empty) return null;
  const doc = memberSnap.docs[0];
  const data = doc.data() as { uid?: string; roles?: unknown };
  if (data.uid && data.uid !== decoded.uid) return null;
  return {
    uid: decoded.uid,
    communityId: COMMUNITY_ID,
    emailLower,
    email: decoded.email || undefined,
    memberId: doc.id,
    roles: Array.isArray(data.roles) ? (data.roles as string[]) : undefined
  };
}

export async function assertMember(req?: NextRequest): Promise<MemberAuthContext | null> {
  const decoded = await decodeRequestCredential(req);
  if (!decoded) return null;
  try {
    return await findActiveMember(decoded);
  } catch {
    return null;
  }
}
