/**
 * Action items come from approved minutes (whose content is public by design). Tracking them —
 * status and notes — is private and stored as separate encrypted records keyed by minutes + task.
 */
import type { RecordLocation } from "./e2ee";
import type { MeetingMinutesRecord } from "./minutes";

export const ACTION_STATUS_PATH = "organizations/ghmo/actionItemStatus";
export const actionStatusLoc = (key: string): RecordLocation => ({ path: ACTION_STATUS_PATH, docId: key });

export type ActionStatus = "open" | "done" | "dropped";
export const ACTION_STATUSES: ActionStatus[] = ["open", "done", "dropped"];

export type TrackedItem = {
  key: string;
  minutesId: string;
  eventTitle: string;
  eventDate?: number;
  task: string;
  assignedTo?: string;
  dueDate?: number;
  status: ActionStatus;
  note?: string;
  overdue: boolean;
};

/** Stable per task: editing other parts of the minutes doesn't lose its status; changing the task does. */
export async function actionKey(minutesId: string, task: string, assignedTo?: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${task.trim()}\n${(assignedTo ?? "").trim()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `${minutesId}_${Array.from(digest.slice(0, 6), b => b.toString(16).padStart(2, "0")).join("")}`;
}

export type StatusRecord = { status: ActionStatus; note?: string };

export async function buildItems(minutes: MeetingMinutesRecord[], statuses: Map<string, StatusRecord>, now = Date.now()): Promise<TrackedItem[]> {
  const items: TrackedItem[] = [];
  for (const record of minutes) {
    if (record.status !== "approved") continue;
    for (const action of record.actionItems ?? []) {
      const key = await actionKey(record.id, action.task, action.assignedTo);
      const tracked = statuses.get(key);
      const status = tracked?.status ?? "open";
      const dueDate = typeof action.dueDate === "number" ? action.dueDate : undefined;
      items.push({
        key,
        minutesId: record.id,
        eventTitle: record.eventTitle,
        eventDate: record.eventDate ?? undefined,
        task: action.task,
        assignedTo: action.assignedTo,
        dueDate,
        status,
        note: tracked?.note,
        overdue: status === "open" && dueDate !== undefined && dueDate < now
      });
    }
  }
  // Overdue first, then soonest due, then undated.
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
}
