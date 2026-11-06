import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { AREA_LABELS, activityCsv, type ActivityRow } from "@/src/lib/activityLog";
import { activityFilters, readActivity, type ActivityEntry } from "@/src/lib/activityLog.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { formatDateTime } from "@/src/lib/format";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const ROUTE = "/api/admin/activity/export";
const bodySchema = z.object({ person: z.string().max(128).nullish(), area: z.string().max(20).nullish(), from: z.string().max(10).nullish(), to: z.string().max(10).nullish() }).strict();

const ROLE_WORDS: Record<string, string> = { super_admin: "Super admin", admin: "Admin", system: "System" };

/**
 * Downloads the filtered activity log as a CSV (plan §29, D85). Super admins only, up to 5,000 rows, with the internet
 * address and browser. The download is itself an activity entry.
 */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`activity-export:${actor.uid}`, 10, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of downloads in an hour. Wait a little and try again." }, { status: 429 });
    }
    const filters = activityFilters(parsed.data);
    if ("error" in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

    const entries: ActivityEntry[] = [];
    let beforeMs: number | null = null;
    while (entries.length < MAX_ROWS) {
      const page = await readActivity({ ...filters, beforeMs }, { superAdmin: true, limit: 500 });
      entries.push(...page.entries);
      if (!page.nextBeforeMs) break;
      beforeMs = page.nextBeforeMs;
    }
    const rows: ActivityRow[] = entries.slice(0, MAX_ROWS).map(entry => ({
      when: entry.createdAtMs ? formatDateTime(entry.createdAtMs, { timeZone: DEFAULT_TIMEZONE }) : "",
      person: entry.person,
      role: entry.role ? (ROLE_WORDS[entry.role] ?? entry.role) : "",
      text: entry.text,
      detail: entry.detail,
      area: entry.area,
      ip: entry.device?.ip ?? undefined,
      userAgent: entry.device?.userAgent ?? undefined
    }));
    const filterWords = [filters.area ? AREA_LABELS[filters.area] : null, filters.person ? "one person" : null, filters.fromMs || filters.toMs ? "a date range" : null].filter(Boolean).join(", ");
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "activity_exported",
      actor: auditActor(actor, admin),
      resource: { type: "activity", id: "export", summary: `${rows.length} entries${filterWords ? ` (${filterWords})` : ""}` },
      after: { rows: rows.length },
      meta: auditMeta(req, ROUTE)
    });
    return new NextResponse(activityCsv(rows, { withDevice: true }), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ghmo-activity.csv"', "Cache-Control": "no-store" }
    });
  } catch (error) {
    return routeError(error);
  }
}
