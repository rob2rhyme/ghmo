/**
 * Friendly dates for the UI (plan §13: no seconds, no server locale). Accepts epoch millis, ISO
 * strings, Date, or Firestore Timestamp-like values ({ toDate() } or { _seconds } / { seconds }).
 */
export type DateInput = number | string | Date | { toDate?: () => Date; _seconds?: number; seconds?: number } | null | undefined;

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") d = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  else if (typeof value === "string") d = new Date(value);
  else if (typeof value.toDate === "function") d = value.toDate();
  else if (typeof value._seconds === "number") d = new Date(value._seconds * 1000);
  else if (typeof value.seconds === "number") d = new Date(value.seconds * 1000);
  else return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

type Opts = { timeZone?: string };

/** "Sat, Dec 12, 2026" */
export function formatDate(value: DateInput, { timeZone }: Opts = {}): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone }) : "";
}

/** "Dec 12, 2026" */
/**
 * For a date typed as a calendar day (a minutes due date): stored as midnight UTC, so it must be shown in UTC,
 * or viewers west of UTC see the day before.
 */
export const DUE_DATE = { timeZone: "UTC" } as const;

export function formatShortDate(value: DateInput, { timeZone }: Opts = {}): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }) : "";
}

/** "7:00 PM" */
export function formatTime(value: DateInput, { timeZone }: Opts = {}): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }) : "";
}

/** "Sat, Dec 12, 2026 · 7:00 PM" */
export function formatDateTime(value: DateInput, opts: Opts = {}): string {
  const d = toDate(value);
  return d ? `${formatDate(d, opts)} · ${formatTime(d, opts)}` : "";
}
