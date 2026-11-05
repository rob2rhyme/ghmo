import { addDays, isValidDate, todayIn } from "./positions";

/**
 * Pure rules for event tasks and task templates (plan §15, 11-B). No I/O, so they are unit tested on their own.
 * Dates are calendar dates ("YYYY-MM-DD") in the event's own time zone, so a task due "3 days before" an evening
 * event stays on the right day across a daylight-saving change.
 */

export const TASK_TITLE_MAX = 120;
export const TASK_NOTES_MAX = 1000;
export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_DESCRIPTION_MAX = 400;
export const MAX_TASKS_PER_EVENT = 100;
export const MAX_TEMPLATE_ITEMS = 50;
export const MAX_ASSIGNEES = 20;
/** How far from the event day a template item may fall, in days (negative = before). */
export const MAX_OFFSET_DAYS = 365;

export type TaskStatus = "open" | "done";

export type EventTask = {
  id: string;
  eventId: string;
  title: string;
  notes: string;
  groupId: string | null;
  memberIds: string[];
  dueOn: string | null;
  status: TaskStatus;
  order: number;
  doneAt: string | null;
  doneBy: string | null;
};

export type TemplateItem = {
  title: string;
  notes: string;
  groupId: string | null;
  /** Days from the event day; negative means before. Null leaves the task without a due date. */
  dueOffsetDays: number | null;
};

export type TaskTemplate = { id: string; name: string; description: string; items: TemplateItem[] };

export const cleanTaskTitle = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TASK_TITLE_MAX) : "");
export const cleanTemplateName = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TEMPLATE_NAME_MAX) : "");

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, max);
}
export const cleanTaskNotes = (value: unknown): string => cleanText(value, TASK_NOTES_MAX);
export const cleanTemplateDescription = (value: unknown): string => cleanText(value, TEMPLATE_DESCRIPTION_MAX);

/** Compares titles without case or extra spaces, so "Book hall" and "book  hall" count as the same task. */
export const taskTitleKey = (title: string): string => cleanTaskTitle(title).toLowerCase();

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The event's calendar day in its own time zone, or null when the event has no start time yet. */
export function eventDay(startsAtMs: number | null | undefined, timeZone: string): string | null {
  if (typeof startsAtMs !== "number" || !Number.isFinite(startsAtMs)) return null;
  return todayIn(new Date(startsAtMs), timeZone);
}

/** The due date for a template offset: the event day plus the offset, or null if either is missing. */
export function dueFromOffset(eventDate: string | null, offsetDays: number | null): string | null {
  if (!eventDate || offsetDays === null || !Number.isInteger(offsetDays)) return null;
  return addDays(eventDate, offsetDays);
}

/** The offset that gives `dueOn` for this event day, so "Save as template" can keep due dates relative. */
export function offsetFromDue(eventDate: string | null, dueOn: string | null): number | null {
  if (!eventDate || !dueOn) return null;
  const offset = daysBetween(eventDate, dueOn);
  return Math.abs(offset) <= MAX_OFFSET_DAYS ? offset : null;
}

export const isOverdue = (task: Pick<EventTask, "status" | "dueOn">, today: string): boolean => task.status === "open" && task.dueOn !== null && task.dueOn < today;

export type TaskCounts = { total: number; done: number; open: number; overdue: number };

export function countTasks(tasks: Pick<EventTask, "status" | "dueOn">[], today: string): TaskCounts {
  let done = 0;
  let overdue = 0;
  for (const task of tasks) {
    if (task.status === "done") done += 1;
    else if (isOverdue(task, today)) overdue += 1;
  }
  return { total: tasks.length, done, open: tasks.length - done, overdue };
}

/** Open tasks first, soonest due first (undated last), then the saved order, then the title. */
export function sortTasks<T extends Pick<EventTask, "status" | "dueOn" | "order" | "title">>(tasks: T[]): T[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
      a.order - b.order ||
      a.title.localeCompare(b.title)
  );
}

/** Checks the fields a person types: a real date and a manageable list of assignees. */
export function checkTaskFields(input: { dueOn?: unknown; memberIds?: unknown }): string | null {
  if (input.dueOn !== undefined && input.dueOn !== null && input.dueOn !== "" && !isValidDate(input.dueOn)) return "The due date isn't a real date.";
  if (Array.isArray(input.memberIds) && new Set(input.memberIds).size > MAX_ASSIGNEES) return `A task can have at most ${MAX_ASSIGNEES} people. Use a group for more.`;
  return null;
}

/** Cleans template items from a request: trims, drops blanks and repeated titles, keeps the order. */
export function normalizeTemplateItems(raw: unknown): { ok: true; items: TemplateItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Add at least one task to the template." };
  const seen = new Set<string>();
  const items: TemplateItem[] = [];
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const title = cleanTaskTitle(item.title);
    if (!title) continue;
    const key = taskTitleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const offset = item.dueOffsetDays;
    const dueOffsetDays = typeof offset === "number" && Number.isInteger(offset) && Math.abs(offset) <= MAX_OFFSET_DAYS ? offset : null;
    items.push({ title, notes: cleanTaskNotes(item.notes), groupId: typeof item.groupId === "string" && item.groupId ? item.groupId : null, dueOffsetDays });
  }
  if (items.length === 0) return { ok: false, error: "Add at least one task to the template." };
  if (items.length > MAX_TEMPLATE_ITEMS) return { ok: false, error: `A template can have at most ${MAX_TEMPLATE_ITEMS} tasks.` };
  return { ok: true, items };
}

export type TemplatePlan =
  | { ok: true; create: { title: string; notes: string; groupId: string | null; dueOn: string | null; order: number }[]; skipped: number; undated: number }
  | { ok: false; error: string };

/**
 * What applying a template would add to an event: items whose title is already a task are skipped (so applying twice
 * changes nothing), due dates come from the event day, and a task that would fall in the past is kept and shows as overdue.
 */
export function planTemplateApplication(input: {
  existing: Pick<EventTask, "title" | "order">[];
  items: TemplateItem[];
  eventDate: string | null;
}): TemplatePlan {
  const have = new Set(input.existing.map(task => taskTitleKey(task.title)));
  let order = input.existing.reduce((max, task) => Math.max(max, task.order), 0);
  const create: { title: string; notes: string; groupId: string | null; dueOn: string | null; order: number }[] = [];
  let skipped = 0;
  let undated = 0;
  for (const item of input.items) {
    const key = taskTitleKey(item.title);
    if (have.has(key)) {
      skipped += 1;
      continue;
    }
    have.add(key);
    order += 10;
    const dueOn = dueFromOffset(input.eventDate, item.dueOffsetDays);
    if (item.dueOffsetDays !== null && dueOn === null) undated += 1;
    create.push({ title: item.title, notes: item.notes, groupId: item.groupId, dueOn, order });
  }
  if (input.existing.length + create.length > MAX_TASKS_PER_EVENT) return { ok: false, error: `An event can have at most ${MAX_TASKS_PER_EVENT} tasks.` };
  return { ok: true, create, skipped, undated };
}

/** Turns an event's tasks into template items, keeping due dates relative to the event day. */
export function templateItemsFromTasks(tasks: Pick<EventTask, "title" | "notes" | "groupId" | "dueOn" | "order">[], eventDate: string | null): TemplateItem[] {
  return [...tasks]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map(task => ({ title: task.title, notes: task.notes, groupId: task.groupId, dueOffsetDays: offsetFromDue(eventDate, task.dueOn) }));
}
