import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { activityFilters, activityPeople, readActivity } from "@/src/lib/activityLog.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * The activity log, newest first, 50 at a time (plan §29, D82–D84). Any active admin; the internet address and browser
 * of each entry only for super admins. Reading it is not itself logged.
 */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    if (!(await checkRateLimit(`activity-read:${actor.uid}`, 120, 10 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of pages in a short while. Wait a few minutes and try again." }, { status: 429 });
    }
    const filters = activityFilters(req.nextUrl.searchParams);
    if ("error" in filters) return NextResponse.json({ error: filters.error }, { status: 400 });
    const superAdmin = isSuperAdmin(admin);
    const [page, people] = await Promise.all([readActivity(filters, { superAdmin }), filters.beforeMs ? Promise.resolve(null) : activityPeople()]);
    return NextResponse.json({ ok: true, ...page, superAdmin, ...(people ? { people } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
