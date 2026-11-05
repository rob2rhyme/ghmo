import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MAX_ASSIGNEES, TASK_NOTES_MAX, TASK_TITLE_MAX } from "@/src/lib/eventTasks";
import { deleteTask, updateTask } from "@/src/lib/eventTasks.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/organizations/[orgSlug]/events/[eventId]/tasks/[taskId]";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const patchSchema = z
  .object({
    title: z.string().max(TASK_TITLE_MAX * 2),
    notes: z.string().max(TASK_NOTES_MAX * 2),
    groupId: z.string().regex(ID).nullable(),
    memberIds: z.array(z.string().regex(MEMBER_ID_PATTERN)).max(MAX_ASSIGNEES + 1),
    dueOn: z.string().max(10).nullable(),
    status: z.enum(["open", "done"])
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: "Nothing to change." });

type Context = { params: Promise<{ orgSlug: string; eventId: string; taskId: string }> };

/** Edits a task or marks it done or open again. Any admin may. */
export async function PATCH(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId, taskId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId) || !ID.test(taskId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    const result = await updateTask(taskId, eventId, parsed.data, actor.uid);
    if (!result.ok) return failureResponse(result);
    const statusChanged = result.before.status !== result.task.status;
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: statusChanged ? (result.task.status === "done" ? "event_task_done" : "event_task_reopened") : "event_task_updated",
      actor: auditActor(actor, admin),
      resource: { type: "eventTask", id: taskId, summary: `${statusChanged ? (result.task.status === "done" ? "Finished" : "Reopened") : "Changed"} the task ${result.task.title}` },
      before: { title: result.before.title, groupId: result.before.groupId, people: result.before.memberIds.length, dueOn: result.before.dueOn, status: result.before.status },
      after: { eventId, title: result.task.title, groupId: result.task.groupId, people: result.task.memberIds.length, dueOn: result.task.dueOn, status: result.task.status },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ task: result.task });
  } catch (error) {
    return routeError(error);
  }
}

/** Removes a task. Any admin may. */
export async function DELETE(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId, taskId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId) || !ID.test(taskId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await deleteTask(taskId, eventId);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "event_task_deleted",
      actor: auditActor(actor, admin),
      resource: { type: "eventTask", id: taskId, summary: `Removed the task ${result.before.title}` },
      before: { eventId, title: result.before.title, status: result.before.status },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
