import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignTotals, reconcileDonationTotals } from "@/src/lib/gofundme";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor } = guard;
  const targetCommunityId = COMMUNITY_ID;

  const totals = await fetchCampaignTotals();
  if (!totals) return NextResponse.json({ error: "Missing GoFundMe credentials" }, { status: 400 });

  await reconcileDonationTotals(targetCommunityId, totals);
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "reconcile",
    actor: {
      uid: actor.uid,
      adminId: actor.adminDocId,
      name: actor.name,
      email: actor.email,
      role: actor.roles[0] ?? "admin"
    },
    resource: { type: "reconcile", summary: "Reconcile donation totals" },
    meta: { route: "/api/gfmpro/reconcile" }
  });

  return NextResponse.json({ ok: true, totals });
}
