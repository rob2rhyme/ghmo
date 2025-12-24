import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { logAudit } from "./audit";
import { COMMUNITY_ID } from "./community";

export type Role = "member" | "admin";

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 12);
}

export async function verifyPin(pin: string, hash: string) {
  return bcrypt.compare(pin, hash);
}

export async function issueCustomToken(uid: string, role: Role) {
  return adminAuth.createCustomToken(uid, { communityId: COMMUNITY_ID, role });
}

export async function verifyIdToken(idToken: string) {
  return adminAuth.verifyIdToken(idToken);
}

export type AuthContext = {
  uid: string;
  communityId: string;
  role: Role;
};

export type MemberAuthContext = {
  uid: string;
  communityId: string;
  emailLower: string;
  email?: string;
  memberId: string;
  roles?: string[];
};

function extractBearerOrCookieToken(req?: NextRequest) {
  const cookieStore = cookies();
  const headerStore = headers();
  const headerToken =
    req?.headers.get("authorization")?.replace(/Bearer\s+/i, "") ||
    headerStore.get("authorization")?.replace(/Bearer\s+/i, "");
  const cookieToken = cookieStore.get("sessionToken")?.value || cookieStore.get("__session")?.value;
  return headerToken || cookieToken || null;
}

export async function getAuthContextFromRequest(req?: NextRequest): Promise<AuthContext | null> {
  const token = extractBearerOrCookieToken(req);
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    const communityId = (decoded as any).communityId || (decoded as any).orgId;
    const role = (decoded as any).role;
    if (!communityId || !role || communityId !== COMMUNITY_ID) return null;
    const context: AuthContext = {
      uid: decoded.uid,
      communityId,
      role
    };
    return context;
  } catch (err) {
    return null;
  }
}

export async function assertCommunityRole(requiredRole: Role) {
  const token = extractBearerOrCookieToken();
  if (!token) return null;
  const decoded = await verifyIdToken(token);
  const ctx: AuthContext = {
    uid: decoded.uid,
    communityId: (decoded as any).communityId || (decoded as any).orgId,
    role: (decoded as any).role
  };
  if (ctx.communityId !== COMMUNITY_ID || (requiredRole === "admin" && ctx.role !== "admin")) {
    return null;
  }
  return ctx;
}

export async function logAuthAttempt(params: {
  communityId: string;
  role: Role;
  success: boolean;
  pinId?: string;
  ip?: string;
  userAgent?: string | null;
}) {
  await logAudit({
    communityId: params.communityId,
    type: "auth_attempt",
    role: params.role,
    metadata: { success: params.success, pinId: params.pinId },
    ip: params.ip,
    userAgent: params.userAgent
  });
}

export async function loadPinByRole(role: Role) {
  const snapshot = await adminDb
    .collection(`community/${COMMUNITY_ID}/pins`)
    .where("role", "==", role)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...(doc.data() as Record<string, any>) };
}

export async function assertMember(req?: NextRequest): Promise<MemberAuthContext | null> {
  const token = extractBearerOrCookieToken(req);
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    const emailLower = decoded.email?.toLowerCase();
    if (!emailLower) return null;
    const snapshot = await adminDb
      .collection(`community/${COMMUNITY_ID}/members`)
      .where("emailLower", "==", emailLower)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data() as Record<string, any>;
    if (data.uid && data.uid !== decoded.uid) return null;
    return {
      uid: decoded.uid,
      communityId: COMMUNITY_ID,
      emailLower,
      email: decoded.email || undefined,
      memberId: doc.id,
      roles: Array.isArray(data.roles) ? data.roles : undefined
    };
  } catch (err) {
    return null;
  }
}
