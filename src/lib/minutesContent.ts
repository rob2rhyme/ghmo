/**
 * The content of meeting minutes in one canonical form, shared by the browser and the server.
 *
 * Approval is bound to a hash of this form: the submitter's browser hashes what they submit, and
 * the server only accepts an approval whose published content hashes to the same value. So an
 * approver can't change the minutes while approving, even though the server can't read draft content.
 */
import type { MeetingAttendance } from "./minutes";

export type MinutesContent = {
  chairedBy?: string;
  agenda: string[];
  discussionSummary?: string;
  decisions: string[];
  actionItems: { task: string; assignedTo?: string; dueDate?: number }[];
  attendance?: MeetingAttendance;
  signatures?: { chairName?: string; secretaryName?: string };
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const lines = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];

function millis(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const ms = value instanceof Date ? value.getTime() : typeof (value as { toMillis?: unknown })?.toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

export function normalizeAttendance(value: unknown): MeetingAttendance | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const present = lines(value);
    return present.length ? { present } : undefined;
  }
  if (typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const present = lines(data.present);
  const absent = lines(data.absent);
  const guests = lines(data.guests);
  if (!present.length && !absent.length && !guests.length) return undefined;
  return { present, ...(absent.length ? { absent } : {}), ...(guests.length ? { guests } : {}) };
}

export function normalizeActionItems(value: unknown): MinutesContent["actionItems"] {
  if (!Array.isArray(value)) return [];
  const items: MinutesContent["actionItems"] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const task = text(item.task);
    if (!task) continue;
    const assignedTo = text(item.assignedTo);
    const dueDate = millis(item.dueDate);
    items.push({ task, ...(assignedTo ? { assignedTo } : {}), ...(dueDate !== undefined ? { dueDate } : {}) });
  }
  return items;
}

export function normalizeSignatures(value: unknown): MinutesContent["signatures"] {
  if (!value || typeof value !== "object") return undefined;
  const chairName = text((value as Record<string, unknown>).chairName);
  const secretaryName = text((value as Record<string, unknown>).secretaryName);
  if (!chairName && !secretaryName) return undefined;
  return { ...(chairName ? { chairName } : {}), ...(secretaryName ? { secretaryName } : {}) };
}

export function normalizeContent(input: Record<string, unknown>): MinutesContent {
  const chairedBy = text(input.chairedBy);
  const discussionSummary = text(input.discussionSummary);
  const attendance = normalizeAttendance(input.attendance);
  const signatures = normalizeSignatures(input.signatures);
  return {
    agenda: lines(input.agenda),
    decisions: lines(input.decisions),
    actionItems: normalizeActionItems(input.actionItems),
    ...(chairedBy ? { chairedBy } : {}),
    ...(discussionSummary ? { discussionSummary } : {}),
    ...(attendance ? { attendance } : {}),
    ...(signatures ? { signatures } : {})
  };
}

/** JSON with sorted keys, so equal content always serializes identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 (hex) of the normalized content. Works in browsers and Node. */
export async function hashContent(input: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(normalizeContent(input)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
