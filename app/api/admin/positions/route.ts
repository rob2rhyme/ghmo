import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin, requireActiveAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { createPosition, listPositionsWithTerms } from "@/src/lib/positions.server";
import { POSITION_TIME_ZONE, TITLE_MAX, todayIn } from "@/src/lib/positions";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/positions";

const createSchema = z.object({
  title: z.string().max(TITLE_MAX * 2),
  titleNe: z.string().max(TITLE_MAX * 2).optional().default(""),
  multiple: z.boolean().optional().default(false)
});

/** The officer positions and every term, plus today's date in the organisation's time zone (plan §15, 11-A). Any admin may read. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { positions, terms } = await listPositionsWithTerms();
    return NextResponse.json({ positions, terms, today: todayIn(new Date(), POSITION_TIME_ZONE), superAdmin: isSuperAdmin(admin) });
  } catch (error) {
    return routeError(error);
  }
}

/** Adds a position to the list (super admin). */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const result = await createPosition({ ...parsed.data, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "position_created",
      actor: auditActor(actor, admin),
      resource: { type: "position", id: result.position.id, summary: `Added the position ${result.position.title}` },
      after: { title: result.position.title, multiple: result.position.multiple },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ position: result.position }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
