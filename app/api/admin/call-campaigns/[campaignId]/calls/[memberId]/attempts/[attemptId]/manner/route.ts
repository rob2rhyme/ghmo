import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { clearAttemptManner } from "@/src/lib/callCampaigns.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/call-campaigns/[campaignId]/calls/[memberId]/attempts/[attemptId]/manner";
const ATTEMPT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Clears the manner rating of one call attempt (super admin). The attempt, its outcome and its note stay. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ campaignId: string; memberId: string; attemptId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { campaignId, memberId, attemptId } = await context.params;
    if (!MEMBER_ID_PATTERN.test(campaignId) || !MEMBER_ID_PATTERN.test(memberId) || !ATTEMPT_ID.test(attemptId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await clearAttemptManner({ campaignId, memberId, attemptId, now: new Date() });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "call_manner_cleared",
      actor: auditActor(actor, admin),
      resource: { type: "callCampaign", id: campaignId, summary: "Cleared the rating on a call" },
      // That a rating was cleared and where; never what it said.
      after: { memberId, attemptId },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
