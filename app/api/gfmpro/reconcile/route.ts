import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignTotals, reconcileDonationTotals } from "@/src/lib/gofundme";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { expirePublicCache, PUBLIC_CACHE_TAGS } from "@/src/lib/publicCache.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
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
    expirePublicCache(PUBLIC_CACHE_TAGS.donations);
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
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}
