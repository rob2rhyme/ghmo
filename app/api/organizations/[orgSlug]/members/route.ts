import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail, normalizeMemberName, sanitizeMemberRoles } from "@/src/lib/members";
import { toPlain } from "@/src/lib/serialize.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MEMBER_ROUTE_PATH = "/api/organizations/ghmo/members";

function buildAuditMeta(req: NextRequest, route: string) {
  return {
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? null,
    route
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;

    const snapshot = await getAdminDb()
      .collection(orgMembersCollectionPath(COMMUNITY_SLUG))
      .orderBy("emailLower")
      .get();
    const members = snapshot.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}

/**
 * Member roles are an allowlist: admin privileges live in the separate `admins`
 * collection and must never be granted through a member record.
 */
const MEMBER_ROLES = ["member"] as const;

const createMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().max(120).nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  roles: z.array(z.enum(MEMBER_ROLES)).max(10).optional()
});

export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor, admin } = guard;

    const parsed = await parseJsonBody(req, createMemberSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const emailInput = body.email;
    const emailLower = normalizeMemberEmail(emailInput);
    if (!emailLower) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const name = normalizeMemberName(body.name);
    const status = body.status ?? "active";
    const sanitizedRoles = sanitizeMemberRoles(body.roles);
    const roles = sanitizedRoles.length > 0 ? sanitizedRoles : ["member"];
    const now = new Date();
    const db = getAdminDb();
    const docRef = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG)).doc();
    const payload: Record<string, unknown> = {
      email: emailInput,
      emailLower,
      status,
      uid: null,
      roles,
      createdAt: now,
      updatedAt: now
    };
    if (name) payload.name = name;

    await docRef.set(payload);
    const meta = buildAuditMeta(req, MEMBER_ROUTE_PATH);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_created",
      actor: {
        uid: actor.uid,
        adminId: admin.id,
        role: actor.roles[0] ?? "admin",
        name: admin.name,
        email: admin.email
      },
      resource: { type: "member", id: docRef.id, path: docRef.path },
      after: { ...payload },
      meta
    });
    return NextResponse.json({ ok: true, member: toPlain({ id: docRef.id, ...payload }) }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
