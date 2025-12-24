import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { fetchCampaignTotals, reconcileDonationTotals } from "@/src/lib/gofundme";
import { logAudit } from "@/src/lib/audit";
import { COMMUNITY_ID } from "@/src/lib/community";

export async function POST(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const targetCommunityId = COMMUNITY_ID;

  const totals = await fetchCampaignTotals();
  if (!totals) return NextResponse.json({ error: "Missing GoFundMe credentials" }, { status: 400 });

  await reconcileDonationTotals(targetCommunityId, totals);
  await logAudit({ communityId: targetCommunityId, type: "reconcile", actorUid: auth.uid, role: auth.role });

  return NextResponse.json({ ok: true, totals });
}
