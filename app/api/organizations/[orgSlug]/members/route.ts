import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail, normalizeMemberName, isMemberStatus, sanitizeMemberRoles } from "@/src/lib/members";
import { toPlain } from "@/src/lib/serialize.server";

const MEMBER_ROUTE_PATH = "/api/organizations/ghmo/members";

function buildAuditMeta(req: NextRequest, route: string) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown",
    userAgent: req.headers.get("user-agent") ?? null,
    route
  };
}

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;

  const snapshot = await adminDb.collection(orgMembersCollectionPath(COMMUNITY_SLUG)).orderBy("emailLower").get();
  const members = snapshot.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ members });
}

type CreateBody = {
  email?: string;
  name?: string | null;
  status?: string;
  roles?: string[];
};

export async function POST(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;

  const body = (await req.json()) as CreateBody;
  const emailInput = body.email?.trim() || "";
  const emailLower = normalizeMemberEmail(emailInput);
  if (!emailLower) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const name = normalizeMemberName(body.name);
  const status = isMemberStatus(body.status) ? body.status : "active";
  const sanitizedRoles = sanitizeMemberRoles(body.roles);
  const roles = sanitizedRoles.length > 0 ? sanitizedRoles : ["member"];
  const now = new Date();
  const docRef = adminDb.collection(orgMembersCollectionPath(COMMUNITY_SLUG)).doc();
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
      adminId: admin.pinId,
      role: actor.roles[0] ?? "admin",
      name: admin.name,
      email: admin.email
    },
    resource: { type: "member", id: docRef.id, path: docRef.path },
    after: { ...payload },
    meta
  });
  return NextResponse.json({ ok: true, member: toPlain({ id: docRef.id, ...payload }) }, { status: 201 });
}
