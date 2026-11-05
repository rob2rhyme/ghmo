import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { memberCallHistory } from "@/src/lib/callCampaigns.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { readMemberLabel } from "@/src/lib/memberNotes.server";

export const dynamic = "force-dynamic";

/**
 * Every call made to one member across all campaigns, with each attempt's outcome and caller (plan §17, 13-C).
 * Any active admin may read it, as they can the call log of a campaign. Notes and ratings stay encrypted here.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, memberId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((await readMemberLabel(memberId)) === null) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json(await memberCallHistory(memberId));
  } catch (error) {
    return routeError(error);
  }
}
