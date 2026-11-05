import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { TITLE_MAX } from "@/src/lib/positions";
import { updatePosition } from "@/src/lib/positions.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/positions/[positionId]";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const patchSchema = z
  .object({
    title: z.string().max(TITLE_MAX * 2),
    titleNe: z.string().max(TITLE_MAX * 2),
    order: z.number().int().min(0).max(100000),
    active: z.boolean(),
    multiple: z.boolean()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: "Nothing to change." });

/** Renames, reorders, switches on or off, or changes "several people can hold it" for a position (super admin). */
export async function PATCH(req: NextRequest, context: { params: Promise<{ positionId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { positionId } = await context.params;
    if (!ID.test(positionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    const result = await updatePosition(positionId, parsed.data);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "position_updated",
      actor: auditActor(actor, admin),
      resource: { type: "position", id: positionId, summary: `Changed the position ${result.position.title}` },
      before: { title: result.before.title, titleNe: result.before.titleNe, order: result.before.order, active: result.before.active, multiple: result.before.multiple },
      after: { title: result.position.title, titleNe: result.position.titleNe, order: result.position.order, active: result.position.active, multiple: result.position.multiple },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ position: result.position });
  } catch (error) {
    return routeError(error);
  }
}
