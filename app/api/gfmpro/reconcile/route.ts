import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignTotals, reconcileDonationTotals } from "@/src/lib/gofundme";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
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
