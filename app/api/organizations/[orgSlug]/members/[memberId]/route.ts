import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberName, sanitizeMemberRoles } from "@/src/lib/members";
import { toPlain } from "@/src/lib/serialize.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { envelopeChecker } from "@/src/lib/e2eeEnvelope.server";
import { MEMBER_ID_PATTERN, PHONE_CONSENT_INPUT, contactInputSchema, memberAuditView } from "@/src/lib/memberContact.server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MEMBER_PATCH_ROUTE = "/api/organizations/ghmo/members/[memberId]";

/** Admin privileges live in the `admins` collection; member records only carry these roles. */
const MEMBER_ROLES = ["member"] as const;

const updateMemberSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  roles: z.array(z.enum(MEMBER_ROLES)).max(10).optional(),
  /** Records consent; this also clears an earlier opt-out, so it is how an admin re-subscribes someone who asked to be added back. */
  emailConsent: z.object({ source: z.enum(["admin_on_request", "signed_up"]) }).optional(),
  /** Records that the member asked to stop receiving email. */
  emailOptOut: z.literal(true).optional(),
  /** The encrypted contact record (plan §12); null removes it. */
  contact: contactInputSchema.nullable().optional(),
  /** Records that the member gave their number for community calls; also clears an earlier call opt-out. */
  phoneConsent: PHONE_CONSENT_INPUT.optional(),
  /** Records that the member asked not to be called. */
  callOptOut: z.literal(true).optional()
});

function buildAuditMeta(req: NextRequest, route: string) {
  return {
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? null,
    route
  };
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string }> }) {
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

    const { memberId } = params;
    if (!MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const parsed = await parseJsonBody(req, updateMemberSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const memberRef = getAdminDb().doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}`);
    const snapshot = await memberRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const beforeData = snapshot.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    let hasChange = false;

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeMemberName(body.name);
      updates.name = name ?? null;
      hasChange = true;
    }

    if (body.status !== undefined) {
      updates.status = body.status;
      hasChange = true;
    }

    if (body.roles !== undefined) {
      const roles = sanitizeMemberRoles(body.roles);
      if (roles.length > 0) {
        updates.roles = roles;
        hasChange = true;
      }
    }

    const now = updates.updatedAt as Date;
    if (body.emailConsent) {
      updates.emailConsent = { at: now, source: body.emailConsent.source, byUid: actor.uid };
      updates.emailOptOutAt = null;
      hasChange = true;
    }

    if (body.emailOptOut) {
      updates.emailOptOutAt = now;
      hasChange = true;
    }

    if (body.contact !== undefined) {
      if (body.contact === null) {
        updates.contact = null;
        updates.hasPhone = false;
      } else {
        const checker = await envelopeChecker(actor.uid);
        if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
        if (!checker.ok(body.contact.enc)) return NextResponse.json({ error: "Unknown or inactive encryption device." }, { status: 403 });
        updates.contact = body.contact.enc;
        updates.hasPhone = body.contact.hasPhone;
      }
      hasChange = true;
    }

    if (body.phoneConsent) {
      updates.phoneConsent = { at: now, source: body.phoneConsent.source, byUid: actor.uid };
      updates.callOptOutAt = null;
      hasChange = true;
    }

    if (body.callOptOut) {
      updates.callOptOutAt = now;
      hasChange = true;
    }

    if (!hasChange) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await memberRef.set(updates, { merge: true });
    const afterSnapshot = await memberRef.get();
    const afterData = afterSnapshot.data() as Record<string, unknown>;
    const meta = buildAuditMeta(req, MEMBER_PATCH_ROUTE);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_updated",
      actor: {
        uid: actor.uid,
        adminId: admin.id,
        role: actor.roles[0] ?? "admin",
        name: admin.name,
        email: admin.email
      },
      resource: { type: "member", id: memberId, path: memberRef.path },
      before: toPlain(memberAuditView({ id: memberId, ...beforeData })),
      after: toPlain(memberAuditView({ id: memberId, ...afterData })),
      meta
    });

    return NextResponse.json({ ok: true, member: toPlain({ id: memberId, ...afterData }) });
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
