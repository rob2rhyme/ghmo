import "server-only";

import { COMMUNITY_SLUG } from "./community";
import { findEventDoc, normalizeEvent } from "./events";
import { getAdminDb } from "./firebaseAdmin";
import { orgEventTaskTemplatesCollectionPath, orgEventTasksCollectionPath, orgGroupsCollectionPath, orgMembersCollectionPath } from "./firestorePaths";
import { fail, type Failure } from "./adminRoute.server";
import { toDate } from "./format";
import {
  MAX_TASKS_PER_EVENT,
  checkTaskFields,
  cleanTaskNotes,
  cleanTaskTitle,
  cleanTemplateDescription,
  cleanTemplateName,
  eventDay,
  normalizeTemplateItems,
  planTemplateApplication,
  sortTasks,
  taskTitleKey,
  templateItemsFromTasks,
  type EventTask,
  type TaskStatus,
  type TaskTemplate,
  type TemplateItem
} from "./eventTasks";

/**
 * Storage for event task checklists and their templates (plan §15, 11-B). Server-written only; every route audits.
 *
 *  organizations/ghmo/eventTasks/{id}          eventId, title, notes, groupId, memberIds[], dueOn, status, order, doneAt, doneBy
 *  organizations/ghmo/eventTaskTemplates/{id}  name, description, items[]
 *
 * Tasks sit in their own collection, not under the event, so they can never ride into the cached public event.
 * Every query is a single-field equality sorted in memory, so no composite index is needed.
 */
const db = () => getAdminDb();
const tasksCol = () => db().collection(orgEventTasksCollectionPath(COMMUNITY_SLUG));
const templatesCol = () => db().collection(orgEventTaskTemplatesCollectionPath(COMMUNITY_SLUG));
const groupsCol = () => db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG));
const membersCol = () => db().collection(orgMembersCollectionPath(COMMUNITY_SLUG));

const BATCH_LIMIT = 450;

function mapTask(id: string, data: Record<string, unknown>): EventTask {
  const doneAt = toDate(data.doneAt as never);
  return {
    id,
    eventId: (data.eventId as string) ?? "",
    title: (data.title as string) ?? "",
    notes: (data.notes as string) ?? "",
    groupId: typeof data.groupId === "string" && data.groupId ? data.groupId : null,
    memberIds: Array.isArray(data.memberIds) ? (data.memberIds as string[]) : [],
    dueOn: typeof data.dueOn === "string" && data.dueOn ? data.dueOn : null,
    status: data.status === "done" ? "done" : "open",
    order: typeof data.order === "number" ? data.order : 0,
    doneAt: doneAt ? doneAt.toISOString() : null,
    doneBy: typeof data.doneBy === "string" && data.doneBy ? data.doneBy : null
  };
}

function mapTemplate(id: string, data: Record<string, unknown>): TaskTemplate {
  const parsed = normalizeTemplateItems(data.items);
  return { id, name: (data.name as string) ?? id, description: (data.description as string) ?? "", items: parsed.ok ? parsed.items : [] };
}

/** The event's own calendar day and its title, or null when the event doesn't exist. */
export async function readEventInfo(eventId: string): Promise<{ id: string; title: string; day: string | null; timeZone: string; startsAtMs: number | null } | null> {
  const snap = await findEventDoc(db(), eventId);
  if (!snap) return null;
  const event = normalizeEvent(snap);
  const timeZone = event.timezone || "America/New_York";
  const startsAtMs = toDate(event.startsAt)?.getTime() ?? null;
  return { id: event.id, title: event.title, day: eventDay(startsAtMs, timeZone), timeZone, startsAtMs };
}

export const listTasksForEvent = async (eventId: string): Promise<EventTask[]> =>
  sortTasks((await tasksCol().where("eventId", "==", eventId).get()).docs.map(doc => mapTask(doc.id, doc.data())));

export const listTasksForGroup = async (groupId: string): Promise<EventTask[]> =>
  sortTasks((await tasksCol().where("groupId", "==", groupId).get()).docs.map(doc => mapTask(doc.id, doc.data())));

/** Open-task counts per group, for the Groups list (one read of the open tasks). */
export async function openTaskCountsByGroup(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const doc of (await tasksCol().where("status", "==", "open").select("groupId").get()).docs) {
    const groupId = doc.get("groupId");
    if (typeof groupId === "string" && groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  return counts;
}

/** A task's group must exist and be switched on; its people must exist. Returns an error sentence or null. */
async function checkLinks(groupId: string | null | undefined, memberIds: string[] | undefined): Promise<Failure | null> {
  if (groupId) {
    const group = await groupsCol().doc(groupId).get();
    if (!group.exists) return fail(404, "That group doesn't exist.");
    if (group.get("active") === false) return fail(409, "That group is switched off. Switch it on first.");
  }
  if (memberIds && memberIds.length) {
    const snaps = await db().getAll(...memberIds.map(id => membersCol().doc(id)));
    if (snaps.some(snap => !snap.exists)) return fail(404, "One of those people isn't on the member list.");
  }
  return null;
}

export type TaskInput = { title?: unknown; notes?: unknown; groupId?: string | null; memberIds?: string[]; dueOn?: string | null };

export async function createTask(input: TaskInput & { eventId: string; actorUid: string; now: Date }): Promise<{ ok: true; task: EventTask } | Failure> {
  const title = cleanTaskTitle(input.title);
  if (!title) return fail(400, "Give the task a title.");
  const problem = checkTaskFields({ dueOn: input.dueOn, memberIds: input.memberIds });
  if (problem) return fail(400, problem);
  if (!(await readEventInfo(input.eventId))) return fail(404, "That event doesn't exist.");
  const link = await checkLinks(input.groupId, input.memberIds);
  if (link) return link;
  const existing = await listTasksForEvent(input.eventId);
  if (existing.length >= MAX_TASKS_PER_EVENT) return fail(409, `An event can have at most ${MAX_TASKS_PER_EVENT} tasks.`);
  if (existing.some(task => taskTitleKey(task.title) === taskTitleKey(title))) return fail(409, "This event already has a task with that title.");
  const ref = tasksCol().doc();
  const data = {
    eventId: input.eventId,
    title,
    notes: cleanTaskNotes(input.notes),
    groupId: input.groupId || null,
    memberIds: [...new Set(input.memberIds ?? [])],
    dueOn: input.dueOn || null,
    status: "open" as TaskStatus,
    order: existing.reduce((max, task) => Math.max(max, task.order), 0) + 10,
    doneAt: null,
    doneBy: null,
    createdBy: input.actorUid,
    createdAt: input.now,
    updatedAt: input.now
  };
  await ref.create(data);
  return { ok: true, task: mapTask(ref.id, data) };
}

export async function readTask(taskId: string): Promise<EventTask | null> {
  const snap = await tasksCol().doc(taskId).get();
  return snap.exists ? mapTask(snap.id, snap.data() ?? {}) : null;
}

export async function updateTask(
  taskId: string,
  eventId: string,
  patch: TaskInput & { status?: TaskStatus },
  actorUid: string,
  now: Date = new Date()
): Promise<{ ok: true; task: EventTask; before: EventTask } | Failure> {
  const ref = tasksCol().doc(taskId);
  const snap = await ref.get();
  // A task is only reachable through its own event, so an id from another event answers "not found".
  if (!snap.exists || snap.get("eventId") !== eventId) return fail(404, "That task doesn't exist.");
  const before = mapTask(taskId, snap.data() ?? {});
  const problem = checkTaskFields({ dueOn: patch.dueOn, memberIds: patch.memberIds });
  if (problem) return fail(400, problem);
  const updates: Record<string, unknown> = { updatedAt: now };
  if (patch.title !== undefined) {
    const title = cleanTaskTitle(patch.title);
    if (!title) return fail(400, "Give the task a title.");
    const clash = (await listTasksForEvent(eventId)).some(task => task.id !== taskId && taskTitleKey(task.title) === taskTitleKey(title));
    if (clash) return fail(409, "This event already has a task with that title.");
    updates.title = title;
  }
  if (patch.notes !== undefined) updates.notes = cleanTaskNotes(patch.notes);
  if (patch.dueOn !== undefined) updates.dueOn = patch.dueOn || null;
  if (patch.groupId !== undefined) {
    // Keeping the group a task already has is always fine, even if the group was switched off since.
    const link = patch.groupId === before.groupId ? null : await checkLinks(patch.groupId, undefined);
    if (link) return link;
    updates.groupId = patch.groupId || null;
  }
  if (patch.memberIds !== undefined) {
    const added = patch.memberIds.filter(id => !before.memberIds.includes(id));
    const link = await checkLinks(null, added);
    if (link) return link;
    updates.memberIds = [...new Set(patch.memberIds)];
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    updates.status = patch.status;
    updates.doneAt = patch.status === "done" ? now : null;
    updates.doneBy = patch.status === "done" ? actorUid : null;
  }
  await ref.update(updates);
  return { ok: true, task: mapTask(taskId, { ...snap.data(), ...updates }), before };
}

export async function deleteTask(taskId: string, eventId: string): Promise<{ ok: true; before: EventTask } | Failure> {
  const ref = tasksCol().doc(taskId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("eventId") !== eventId) return fail(404, "That task doesn't exist.");
  const before = mapTask(taskId, snap.data() ?? {});
  await ref.delete();
  return { ok: true, before };
}

async function inBatches<T>(items: T[], apply: (batch: FirebaseFirestore.WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const item of items.slice(i, i + BATCH_LIMIT)) apply(batch, item);
    await batch.commit();
  }
}

/** Removes every task of a deleted event. */
export async function deleteTasksForEvent(eventId: string): Promise<number> {
  const docs = (await tasksCol().where("eventId", "==", eventId).select().get()).docs;
  await inBatches(docs, (batch, doc) => batch.delete(doc.ref));
  return docs.length;
}

/** Tasks keep working when their group is deleted: they just have no group any more. */
export async function clearGroupFromTasks(groupId: string): Promise<number> {
  const docs = (await tasksCol().where("groupId", "==", groupId).select().get()).docs;
  await inBatches(docs, (batch, doc) => batch.update(doc.ref, { groupId: null, updatedAt: new Date() }));
  return docs.length;
}

export async function applyTemplate(input: { eventId: string; templateId: string; actorUid: string; now: Date }): Promise<
  { ok: true; created: EventTask[]; skipped: number; undated: number; templateName: string } | Failure
> {
  const event = await readEventInfo(input.eventId);
  if (!event) return fail(404, "That event doesn't exist.");
  const templateSnap = await templatesCol().doc(input.templateId).get();
  if (!templateSnap.exists) return fail(404, "That template doesn't exist.");
  const template = mapTemplate(templateSnap.id, templateSnap.data() ?? {});
  const existing = await listTasksForEvent(input.eventId);
  const plan = planTemplateApplication({ existing, items: template.items, eventDate: event.day });
  if (!plan.ok) return fail(409, plan.error);
  // A group named in the template may have been deleted or switched off since; such tasks are created without it.
  const groupSnaps = await Promise.all([...new Set(plan.create.map(item => item.groupId).filter((id): id is string => Boolean(id)))].map(async id => [id, await groupsCol().doc(id).get()] as const));
  const usable = new Set(groupSnaps.filter(([, snap]) => snap.exists && snap.get("active") !== false).map(([id]) => id));
  const created: EventTask[] = [];
  await inBatches(plan.create, (batch, item) => {
    const ref = tasksCol().doc();
    const data = {
      eventId: input.eventId,
      title: item.title,
      notes: item.notes,
      groupId: item.groupId && usable.has(item.groupId) ? item.groupId : null,
      memberIds: [] as string[],
      dueOn: item.dueOn,
      status: "open" as TaskStatus,
      order: item.order,
      doneAt: null,
      doneBy: null,
      createdBy: input.actorUid,
      createdAt: input.now,
      updatedAt: input.now
    };
    batch.create(ref, data);
    created.push(mapTask(ref.id, data));
  });
  return { ok: true, created: sortTasks(created), skipped: plan.skipped, undated: plan.undated, templateName: template.name };
}

// ---- Templates ----

export async function listTemplates(): Promise<TaskTemplate[]> {
  return (await templatesCol().get()).docs.map(doc => mapTemplate(doc.id, doc.data())).sort((a, b) => a.name.localeCompare(b.name));
}

const nameTaken = (templates: TaskTemplate[], name: string, exceptId?: string) =>
  templates.some(template => template.id !== exceptId && template.name.toLowerCase() === name.toLowerCase());

export async function createTemplate(input: {
  name: unknown;
  description: unknown;
  items?: unknown;
  fromEventId?: string;
  actorUid: string;
  now: Date;
}): Promise<{ ok: true; template: TaskTemplate } | Failure> {
  const name = cleanTemplateName(input.name);
  if (!name) return fail(400, "Give the template a name.");
  let items: TemplateItem[];
  if (input.fromEventId) {
    const event = await readEventInfo(input.fromEventId);
    if (!event) return fail(404, "That event doesn't exist.");
    const tasks = await listTasksForEvent(input.fromEventId);
    if (tasks.length === 0) return fail(409, "This event has no tasks to save yet.");
    const parsed = normalizeTemplateItems(templateItemsFromTasks(tasks, event.day));
    if (!parsed.ok) return fail(400, parsed.error);
    items = parsed.items;
  } else {
    const parsed = normalizeTemplateItems(input.items);
    if (!parsed.ok) return fail(400, parsed.error);
    items = parsed.items;
  }
  if (nameTaken(await listTemplates(), name)) return fail(409, "There is already a template with that name.");
  const ref = templatesCol().doc();
  const data = { name, description: cleanTemplateDescription(input.description), items, createdBy: input.actorUid, createdAt: input.now, updatedAt: input.now };
  await ref.create(data);
  return { ok: true, template: mapTemplate(ref.id, data) };
}

export async function updateTemplate(
  id: string,
  patch: { name?: unknown; description?: unknown; items?: unknown },
  now: Date = new Date()
): Promise<{ ok: true; template: TaskTemplate; before: TaskTemplate } | Failure> {
  const ref = templatesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That template doesn't exist.");
  const before = mapTemplate(id, snap.data() ?? {});
  const updates: Record<string, unknown> = { updatedAt: now };
  if (patch.name !== undefined) {
    const name = cleanTemplateName(patch.name);
    if (!name) return fail(400, "Give the template a name.");
    if (nameTaken(await listTemplates(), name, id)) return fail(409, "There is already a template with that name.");
    updates.name = name;
  }
  if (patch.description !== undefined) updates.description = cleanTemplateDescription(patch.description);
  if (patch.items !== undefined) {
    const parsed = normalizeTemplateItems(patch.items);
    if (!parsed.ok) return fail(400, parsed.error);
    updates.items = parsed.items;
  }
  await ref.update(updates);
  return { ok: true, template: mapTemplate(id, { ...snap.data(), ...updates }), before };
}

export async function deleteTemplate(id: string): Promise<{ ok: true; before: TaskTemplate } | Failure> {
  const ref = templatesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That template doesn't exist.");
  const before = mapTemplate(id, snap.data() ?? {});
  await ref.delete();
  return { ok: true, before };
}
