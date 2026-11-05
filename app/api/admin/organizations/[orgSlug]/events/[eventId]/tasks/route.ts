import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MAX_ASSIGNEES, TASK_NOTES_MAX, TASK_TITLE_MAX, countTasks } from "@/src/lib/eventTasks";
import { createTask, listTasksForEvent, readEventInfo } from "@/src/lib/eventTasks.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { POSITION_TIME_ZONE, todayIn } from "@/src/lib/positions";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/organizations/[orgSlug]/events/[eventId]/tasks";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const createSchema = z.object({
  title: z.string().max(TASK_TITLE_MAX * 2),
  notes: z.string().max(TASK_NOTES_MAX * 2).optional().default(""),
  groupId: z.string().regex(ID).nullable().optional().default(null),
  memberIds: z.array(z.string().regex(MEMBER_ID_PATTERN)).max(MAX_ASSIGNEES + 1).optional().default([]),
  dueOn: z.string().max(10).nullable().optional().default(null)
});

type Context = { params: Promise<{ orgSlug: string; eventId: string }> };

/** An event's task checklist, with its counts and the event's own day (plan §15, 11-B). Any admin may read. */
export async function GET(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const event = await readEventInfo(eventId);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const tasks = await listTasksForEvent(eventId);
    const today = todayIn(new Date(), POSITION_TIME_ZONE);
    return NextResponse.json({ tasks, today, counts: countTasks(tasks, today), eventDay: event.day });
  } catch (error) {
    return routeError(error);
  }
}

/** Adds a task to the event. Any admin may. */
export async function POST(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const result = await createTask({ ...parsed.data, eventId, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "event_task_created",
      actor: auditActor(actor, admin),
      resource: { type: "eventTask", id: result.task.id, summary: `Added the task ${result.task.title}` },
      after: { eventId, title: result.task.title, groupId: result.task.groupId, people: result.task.memberIds.length, dueOn: result.task.dueOn },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ task: result.task }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
