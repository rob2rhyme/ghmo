import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { applyTemplate } from "@/src/lib/eventTasks.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/organizations/[orgSlug]/events/[eventId]/tasks/apply-template";
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const bodySchema = z.object({ templateId: z.string().regex(ID) });

/** Adds a template's tasks to the event, skipping titles it already has and counting due dates from the event day. Any admin may. */
export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const result = await applyTemplate({ eventId, templateId: parsed.data.templateId, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "event_tasks_template_applied",
      actor: auditActor(actor, admin),
      resource: { type: "event", id: eventId, summary: `Added ${result.created.length} tasks from the template ${result.templateName}` },
      after: { eventId, templateId: parsed.data.templateId, added: result.created.length, skipped: result.skipped },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ created: result.created, skipped: result.skipped, undated: result.undated });
  } catch (error) {
    return routeError(error);
  }
}
