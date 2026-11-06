import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { confirmationTarget, deletionSummary } from "@/src/lib/memberDeletion";
import { previewMemberDeletion } from "@/src/lib/memberDeletion.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";

export const dynamic = "force-dynamic";

/**
 * What deleting this member would remove and keep, and the text to type to confirm (plan §20). Reads only. Super admin
 * only, like the deletion itself, so the preview is not a way to count what is held about someone.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, memberId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const preview = await previewMemberDeletion(memberId);
    if (!preview.ok) return failureResponse(preview);
    return NextResponse.json({ confirmWith: confirmationTarget(preview.member), counts: preview.counts, ...deletionSummary(preview.counts) });
  } catch (error) {
    return routeError(error);
  }
}
