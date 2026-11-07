import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { copyBroadcast } from "@/src/lib/copies.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/broadcasts/[broadcastId]/copy";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Copies a broadcast, whatever its state, as a new draft that needs approval again (plan §30, D90). Any admin. */
export async function POST(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { broadcastId } = await context.params;
    if (!ID.test(broadcastId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const result = await copyBroadcast({ broadcastId, actorUid: actor.uid, actorName: admin.name ?? "", now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "broadcast_copied",
      actor: auditActor(actor, admin),
      resource: { type: "broadcast", id: result.id, summary: result.subject },
      after: { copiedFrom: broadcastId },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
