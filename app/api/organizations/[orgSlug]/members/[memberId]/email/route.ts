import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { changeMemberEmail } from "@/src/lib/memberEmailChange.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { toPlain } from "@/src/lib/serialize.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/organizations/ghmo/members/[memberId]/email";

/** The new address, or "" to remove it. */
const bodySchema = z.object({ email: z.union([z.literal(""), z.string().trim().email("Enter a whole email address, like name@example.com.").max(320)]) }).strict();

/**
 * Adds, changes or removes a member's email (plan §25, Phase 18). Super admins only (D57). The activity log records
 * that it happened and what kind of change it was, never either address (D63).
 */
export async function PUT(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { orgSlug, memberId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`member-email:${actor.uid}`, 60, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of email changes in an hour. Wait a little and try again." }, { status: 429 });
    }
    const result = await changeMemberEmail({ memberId, newEmail: parsed.data.email, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_email_changed",
      actor: auditActor(actor, admin),
      resource: { type: "member", id: memberId, summary: `Email ${result.kind}${result.oldKept ? "; the old address stays on the do-not-email list" : ""}` },
      after: { kind: result.kind, oldAddressKept: result.oldKept },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, kind: result.kind, oldKept: result.oldKept, member: toPlain(result.member) });
  } catch (error) {
    return routeError(error);
  }
}
