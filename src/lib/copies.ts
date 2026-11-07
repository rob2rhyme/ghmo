/**
 * Copying an event or a broadcast as a new draft (plan §30, Phase 23, D88–D90). Pure: which fields carry over and
 * which start fresh, so the routes only read, call these and write.
 */

export const EVENT_TITLE_MAX = 120;
const COPY_SUFFIX = " (copy)";

/** "Lhosar 2026" becomes "Lhosar 2026 (copy)", kept within the title limit. */
export function copyTitle(title: string): string {
  const base = (title ?? "").trim() || "Untitled event";
  return base.length + COPY_SUFFIX.length <= EVENT_TITLE_MAX ? `${base}${COPY_SUFFIX}` : `${base.slice(0, EVENT_TITLE_MAX - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

/** The new draft event (D88): the same words, place and flyer settings; no dates, not featured, not published. */
export function eventCopyFields(source: Record<string, unknown>): Record<string, unknown> {
  return {
    title: copyTitle(String(source.title ?? "")),
    summary: typeof source.summary === "string" ? source.summary : "",
    body: typeof source.body === "string" && source.body.trim() ? source.body : copyTitle(String(source.title ?? "")),
    status: "draft",
    startsAt: null,
    endsAt: null,
    timezone: typeof source.timezone === "string" && source.timezone ? source.timezone : "America/New_York",
    location: typeof source.location === "string" ? source.location : "",
    featured: false,
    announcementDocTemplate: source.announcementDocTemplate ?? null,
    announcementPdfSource: source.announcementPdfSource ?? null
  };
}

/** A copied task (D89): the same title, notes, group and order; not done, nobody on it, no due date. */
export function taskCopyFields(task: { title: string; notes?: string | null; groupId?: string | null; order?: number | null }, usableGroups: Set<string>): Record<string, unknown> {
  return {
    title: task.title,
    notes: task.notes ?? "",
    groupId: task.groupId && usableGroups.has(task.groupId) ? task.groupId : null,
    memberIds: [] as string[],
    dueOn: null,
    status: "open",
    order: typeof task.order === "number" ? task.order : 0,
    doneAt: null,
    doneBy: null
  };
}
