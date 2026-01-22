import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

async function loadActorSnapshot(orgSlug: string, authUid?: string | null, emailLower?: string | null) {
  const collection = getAdminDb().collection(orgAdminsCollectionPath(orgSlug));
  if (authUid) {
    const authSnap = await collection.where("authUid", "==", authUid).limit(1).get();
    if (!authSnap.empty) {
      const data = authSnap.docs[0].data() as Record<string, any>;
      return { name: data.name as string | undefined, roles: Array.isArray(data.roles) ? (data.roles as string[]) : [] };
    }
    const directDoc = await collection.doc(authUid).get();
    if (directDoc.exists) {
      const data = directDoc.data() as Record<string, any>;
      return { name: data.name as string | undefined, roles: Array.isArray(data.roles) ? (data.roles as string[]) : [] };
    }
  }
  if (emailLower) {
    const emailSnap = await collection.where("emailLower", "==", emailLower).limit(1).get();
    if (!emailSnap.empty) {
      const data = emailSnap.docs[0].data() as Record<string, any>;
      return { name: data.name as string | undefined, roles: Array.isArray(data.roles) ? (data.roles as string[]) : [] };
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  const ctx = await getAuthContextFromRequest(req);
  const decodedInfo = ctx
    ? {
        uid: ctx.uid,
        orgSlug: ctx.orgSlug,
        role: ctx.role,
        email: ctx.email,
        emailLower: ctx.emailLower,
        pinId: (ctx as any).pinId
      }
    : null;
  console.debug("Auth/me request", {
    authenticated: Boolean(ctx),
    decoded: decodedInfo,
    url: req.url
  });
  if (!ctx) return NextResponse.json({ authenticated: false, role: null, uid: null, orgSlug: null });
  if (!ctx.orgSlug) {
    console.warn("Auth/me missing orgSlug claim", { uid: ctx.uid, decoded: decodedInfo });
    return NextResponse.json({
      authenticated: false,
      isAdmin: false,
      role: null,
      uid: null,
      orgSlug: null,
      error: "MISSING_ORGSLUG_CLAIM"
    });
  }

  try {
    const { actor } = await requireActiveAdmin(req, ctx.orgSlug);
    const actorSnapshot =
      (await loadActorSnapshot(ctx.orgSlug, ctx.uid, ctx.emailLower)) ?? {
        name: actor.name,
        roles: actor.roles
      };
    console.debug("Auth/me admin lookup succeeded", { uid: ctx.uid, emailLower: ctx.emailLower, adminDocId: actor.adminDocId });
    return NextResponse.json({
      authenticated: true,
      isAdmin: true,
      role: actor.roles[0] ?? "admin",
      uid: ctx.uid,
      orgSlug: ctx.orgSlug,
      adminId: actor.adminDocId,
      roles: actor.roles,
      actor: actorSnapshot ?? { roles: ["admin"] }
    });
  } catch (err) {
    if (err instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: err.issues },
        { status: 503 }
      );
    }
    if (err instanceof AdminAccessError) {
      console.warn("Auth/me admin guard failed", { uid: ctx.uid, reason: err.reason });
      return NextResponse.json({
        authenticated: false,
        isAdmin: false,
        role: null,
        uid: null,
        orgSlug: null,
        error: err.message,
        reason: err.reason
      });
    }
    console.error("Auth/me unexpected error", err);
    return NextResponse.json({
      authenticated: false,
      isAdmin: false,
      role: null,
      uid: null,
      orgSlug: null,
      error: "Unexpected error"
    });
  }
}
