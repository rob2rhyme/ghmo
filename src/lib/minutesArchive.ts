import { publicView } from "./minutesRecords";

/**
 * What the public governance archive shows of approved minutes. Content is public by design, but
 * the archive is indexable by search engines, so it shows attendance as counts (no names) and
 * leaves out internal details like who recorded, submitted or approved.
 */
export type ArchiveEntry = {
  id: string;
  eventTitle: string;
  eventDate?: number;
  meetingType: string;
  agenda: string[];
  discussionSummary?: string;
  decisions: string[];
  actionItems: { task: string; dueDate?: number }[];
  attendance?: { present: number; absent: number; guests: number };
  signatures?: { chairName?: string; secretaryName?: string };
  approvedAt?: number;
  version?: number;
};

const millis = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  return undefined;
};

/** Null unless the record is approved. */
export function toArchiveEntry(doc: Record<string, unknown>): ArchiveEntry | null {
  if (doc.status !== "approved") return null;
  const view = publicView(doc) as Record<string, unknown> & {
    agenda?: string[];
    decisions?: string[];
    discussionSummary?: string;
    actionItems?: { task: string; dueDate?: unknown }[];
    signatures?: { chairName?: string; secretaryName?: string };
  };
  const attendance = view.attendance as { present?: string[]; absent?: string[]; guests?: string[] } | undefined;
  return {
    id: String(view.id),
    eventTitle: String(view.eventTitle ?? "Meeting"),
    eventDate: millis(view.eventDate),
    meetingType: String(view.meetingType ?? "Meeting"),
    agenda: view.agenda ?? [],
    discussionSummary: view.discussionSummary,
    decisions: view.decisions ?? [],
    actionItems: (view.actionItems ?? []).map(item => ({ task: item.task, dueDate: millis(item.dueDate) })),
    ...(attendance
      ? { attendance: { present: attendance.present?.length ?? 0, absent: attendance.absent?.length ?? 0, guests: attendance.guests?.length ?? 0 } }
      : {}),
    ...(view.signatures ? { signatures: view.signatures } : {}),
    approvedAt: millis(view.approvedAt),
    version: typeof view.version === "number" ? view.version : undefined
  };
}
