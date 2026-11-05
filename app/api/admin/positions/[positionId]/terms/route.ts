import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { NOTE_MAX } from "@/src/lib/positions";
import { createTerm } from "@/src/lib/positions.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/positions/[positionId]/terms";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const termSchema = z.object({
  memberId: z.string().regex(MEMBER_ID_PATTERN),
  startsOn: z.string().max(10),
  endsOn: z.string().max(10).nullable().optional().default(null),
  note: z.string().max(NOTE_MAX * 2).optional().default(""),
  endPrevious: z.boolean().optional().default(false)
});

/** Seats a member in a position from a date, optionally ending the current holder the day before (super admin). */
export async function POST(req: NextRequest, context: { params: Promise<{ positionId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { positionId } = await context.params;
    if (!ID.test(positionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, termSchema);
    if (!parsed.ok) return parsed.response;
    const result = await createTerm({ ...parsed.data, positionId, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "position_term_added",
      actor: auditActor(actor, admin),
      resource: { type: "positionTerm", id: result.term.id, summary: `${result.memberName} as ${result.position.title} from ${result.term.startsOn}` },
      after: { positionId, memberId: result.term.memberId, startsOn: result.term.startsOn, endsOn: result.term.endsOn, endedPrevious: result.closed },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ term: result.term, closed: result.closed }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
