import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { NOTE_MAX } from "@/src/lib/positions";
import { deleteTerm, updateTerm } from "@/src/lib/positions.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/position-terms/[termId]";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const patchSchema = z
  .object({
    startsOn: z.string().max(10),
    endsOn: z.string().max(10).nullable(),
    note: z.string().max(NOTE_MAX * 2)
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: "Nothing to change." });

/** Changes a term's dates or note, for example to end it on a date (super admin). */
export async function PATCH(req: NextRequest, context: { params: Promise<{ termId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { termId } = await context.params;
    if (!ID.test(termId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    const result = await updateTerm(termId, { ...parsed.data, endsOn: parsed.data.endsOn === null ? "" : parsed.data.endsOn });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "position_term_updated",
      actor: auditActor(actor, admin),
      resource: { type: "positionTerm", id: termId, summary: `Changed a ${result.term.positionId} term` },
      before: { startsOn: result.before.startsOn, endsOn: result.before.endsOn },
      after: { startsOn: result.term.startsOn, endsOn: result.term.endsOn },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ term: result.term });
  } catch (error) {
    return routeError(error);
  }
}

/** Removes a term that was entered by mistake (super admin). To record that someone left, end the term instead. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ termId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { termId } = await context.params;
    if (!ID.test(termId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await deleteTerm(termId);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "position_term_removed",
      actor: auditActor(actor, admin),
      resource: { type: "positionTerm", id: termId, summary: `Removed a ${result.before.positionId} term` },
      before: { positionId: result.before.positionId, memberId: result.before.memberId, startsOn: result.before.startsOn, endsOn: result.before.endsOn },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
