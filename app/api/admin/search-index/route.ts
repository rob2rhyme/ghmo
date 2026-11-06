import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { buildSearchIndex } from "@/src/lib/adminSearch.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * The admin palette's list of people and records (plan §27, Phase 20): names, titles, dates and statuses, never
 * encrypted content. Any active admin. Not written to the activity log (D74); rate limited, and the browser keeps it in
 * memory for 10 minutes, so this runs about once per opening.
 */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    if (!(await checkRateLimit(`search-index:${actor.uid}`, 30, 10 * 60 * 1000)).success) {
      return NextResponse.json({ error: "Search was opened many times in a short while. Wait a few minutes and try again." }, { status: 429 });
    }
    const entries = await buildSearchIndex();
    return NextResponse.json({ ok: true, entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
