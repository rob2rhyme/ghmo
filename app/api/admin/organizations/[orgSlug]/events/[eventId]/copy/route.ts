import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { copyEvent } from "@/src/lib/copies.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/organizations/ghmo/events/[eventId]/copy";
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const bodySchema = z.object({ withTasks: z.boolean().optional().default(true) }).strict();

/** Copies an event as a new draft with no dates, and its tasks unless told not to (plan §30, D88–D89). Any admin. */
export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { orgSlug, eventId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const result = await copyEvent({ eventId, withTasks: parsed.data.withTasks, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "event_copied",
      actor: auditActor(actor, admin),
      resource: { type: "event", id: result.id, summary: `${result.sourceTitle}${result.tasks ? ` with ${result.tasks} task${result.tasks === 1 ? "" : "s"}` : ""}` },
      after: { copiedFrom: eventId, tasks: result.tasks },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, id: result.id, title: result.title, tasks: result.tasks }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
