import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MAX_TEMPLATE_ITEMS, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from "@/src/lib/eventTasks";
import { templateItemSchema } from "@/src/lib/eventTasks.schemas";
import { createTemplate, listTemplates } from "@/src/lib/eventTasks.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/task-templates";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

// Either the items typed in, or an event to copy the tasks from.
const createSchema = z
  .object({
    name: z.string().max(TEMPLATE_NAME_MAX * 2),
    description: z.string().max(TEMPLATE_DESCRIPTION_MAX * 2).optional().default(""),
    items: z.array(templateItemSchema).max(MAX_TEMPLATE_ITEMS + 1).optional(),
    fromEventId: z.string().regex(ID).optional()
  })
  .refine(value => Boolean(value.items) !== Boolean(value.fromEventId), { message: "Give either the tasks or an event to copy them from." });

/** Every task template. Any admin may read. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json({ templates: await listTemplates(), superAdmin: isSuperAdmin(admin) });
  } catch (error) {
    return routeError(error);
  }
}

/** Makes a template from typed items, or from an event's tasks. Any admin may. */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const result = await createTemplate({ ...parsed.data, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "task_template_created",
      actor: auditActor(actor, admin),
      resource: { type: "taskTemplate", id: result.template.id, summary: `Saved the template ${result.template.name} (${result.template.items.length} tasks)` },
      after: { name: result.template.name, tasks: result.template.items.length, fromEventId: parsed.data.fromEventId ?? null },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ template: result.template }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
