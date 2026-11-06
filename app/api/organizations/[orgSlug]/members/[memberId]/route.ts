import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { isSuperAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, routeError } from "@/src/lib/adminRoute.server";
import { deleteMember } from "@/src/lib/memberDeletion.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { checkMemberSince, cleanCity, normalizeState } from "@/src/lib/memberProfile";
import { normalizeMemberName, sanitizeMemberRoles } from "@/src/lib/members";
import { POSITION_TIME_ZONE, todayIn } from "@/src/lib/positions";
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
  /** The profile facts (plan §17, 13-A): the day they joined, and city and state (no street address). Null or empty clears one. */
  memberSince: z.string().max(10).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  state: z.string().max(200).nullable().optional(),
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
      { error: "The site isn't set up to do this yet. Ask the site administrator." },
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

    // Fixing a typo in someone's name is for a super admin. Sending the name they already have changes nothing,
    // so other updates that happen to carry it keep working for every admin. Someone without an email is known
    // only by name and number, so their name can't be blanked.
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeMemberName(body.name) ?? null;
      const current = normalizeMemberName(typeof beforeData.name === "string" ? beforeData.name : null) ?? null;
      if (name !== current) {
        if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super admin can change a member's name." }, { status: 403 });
        if (!name && !String(beforeData.emailLower ?? "").includes("@")) {
          return NextResponse.json({ error: "Someone without an email needs a name." }, { status: 400 });
        }
        updates.name = name;
        hasChange = true;
      }
    }

    // Any active admin may set these. The date must be a real day that is not in the future.
    if (Object.prototype.hasOwnProperty.call(body, "memberSince")) {
      const since = body.memberSince?.trim() || null;
      if (since) {
        const problem = checkMemberSince(since, todayIn(new Date(), POSITION_TIME_ZONE));
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      }
      updates.memberSince = since;
      hasChange = true;
    }
    if (Object.prototype.hasOwnProperty.call(body, "city")) {
      updates.city = cleanCity(body.city) || null;
      hasChange = true;
    }
    if (Object.prototype.hasOwnProperty.call(body, "state")) {
      updates.state = normalizeState(body.state) || null;
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
    const memberHasEmail = String(beforeData.emailLower ?? "").includes("@");
    if (body.emailConsent && !memberHasEmail) {
      return NextResponse.json({ error: "This member has no email address, so there is nothing to consent to." }, { status: 400 });
    }
    if (body.emailConsent) {
      updates.emailConsent = { at: now, source: body.emailConsent.source, byUid: actor.uid };
      updates.emailOptOutAt = null;
      hasChange = true;
    }

    if (body.emailOptOut) {
      updates.emailOptOutAt = now;
      hasChange = true;
    }

    // A member without an email is reached by phone only, so their number can't be removed.
    if (!memberHasEmail && body.contact !== undefined && !body.contact?.hasPhone) {
      return NextResponse.json({ error: "Someone without an email needs a phone number. Disable them instead if they should no longer be contacted." }, { status: 400 });
    }

    if (body.contact !== undefined) {
      if (body.contact === null) {
        updates.contact = null;
        updates.hasPhone = false;
      } else {
        const checker = await envelopeChecker(actor.uid);
        if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
        if (!checker.ok(body.contact.enc)) return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
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
        { error: "The site isn't set up to do this yet. Ask the site administrator." },
        { status: 503 }
      );
    }
    throw error;
  }
}

const deleteSchema = z.object({ confirm: z.string().max(400) }).strict();

/**
 * Deletes a member and what points at them (plan §20, Phase 15). Super admin only, one member at a time, and the body
 * must carry the member's name (or email) typed to confirm. The member document is deleted last, after the activity
 * log entry, so a failure part way is finished by trying again. The entry holds the member's id and counts, never their
 * name, email or numbers.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const params = await context.params;
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "The site isn't set up to do this yet. Ask the site administrator." }, { status: 503 });
  try {
    if (params.orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(params.memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, deleteSchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`member-delete:${actor.uid}`, 20, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of deletions in an hour. Wait a little and try again." }, { status: 429 });
    }
    const outcome = await deleteMember({ memberId: params.memberId, confirm: parsed.data.confirm, now: new Date() });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    const { counts, suppressionKept } = outcome.result;
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_deleted",
      actor: auditActor(actor, admin),
      resource: { type: "member", id: params.memberId, summary: `Member deleted (${counts.notes} notes, ${counts.callRows} call records${suppressionKept ? ", do-not-email record kept" : ""})` },
      after: { ...counts, suppressionKept },
      meta: auditMeta(req, MEMBER_PATCH_ROUTE)
    });
    await outcome.finish();
    return NextResponse.json({ ok: true, counts, suppressionKept });
  } catch (error) {
    return routeError(error);
  }
}
