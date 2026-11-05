import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MAX_TEMPLATE_ITEMS, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_NAME_MAX } from "@/src/lib/eventTasks";
import { templateItemSchema } from "@/src/lib/eventTasks.schemas";
import { deleteTemplate, updateTemplate } from "@/src/lib/eventTasks.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/task-templates/[templateId]";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const patchSchema = z
  .object({
    name: z.string().max(TEMPLATE_NAME_MAX * 2),
    description: z.string().max(TEMPLATE_DESCRIPTION_MAX * 2),
    items: z.array(templateItemSchema).max(MAX_TEMPLATE_ITEMS + 1)
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: "Nothing to change." });

type Context = { params: Promise<{ templateId: string }> };

/** Renames a template or changes its tasks. Any admin may. */
export async function PATCH(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { templateId } = await context.params;
    if (!ID.test(templateId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    const result = await updateTemplate(templateId, parsed.data);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "task_template_updated",
      actor: auditActor(actor, admin),
      resource: { type: "taskTemplate", id: templateId, summary: `Changed the template ${result.template.name}` },
      before: { name: result.before.name, tasks: result.before.items.length },
      after: { name: result.template.name, tasks: result.template.items.length },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ template: result.template });
  } catch (error) {
    return routeError(error);
  }
}

/** Deletes a template (super admin). Events keep the tasks they already got from it. */
export async function DELETE(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { templateId } = await context.params;
    if (!ID.test(templateId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await deleteTemplate(templateId);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "task_template_deleted",
      actor: auditActor(actor, admin),
      resource: { type: "taskTemplate", id: templateId, summary: `Deleted the template ${result.before.name}` },
      before: { name: result.before.name, tasks: result.before.items.length },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
