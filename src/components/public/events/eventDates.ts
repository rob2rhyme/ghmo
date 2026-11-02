import { DEFAULT_TIMEZONE, type EventRecord } from "@/src/lib/events.shared";
import { formatDate, formatTime, toDate, type DateInput } from "@/src/lib/format";

/**
 * Display helpers for public event dates. The events API sends startsAt/endsAt as epoch millis;
 * toDate() also accepts Timestamp-like values, so older payloads still read correctly.
 */

/** The event's time zone, falling back to the default when it is missing or not a real zone. */
export function eventTimeZone(evt: Pick<EventRecord, "timezone">): string {
  const zone = evt.timezone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function eventStart(evt: Pick<EventRecord, "startsAt">): Date | null {
  return toDate(evt.startsAt as DateInput);
}

export function eventEnd(evt: Pick<EventRecord, "endsAt">): Date | null {
  return toDate(evt.endsAt as DateInput);
}

/** Short zone name such as "EST" or "EDT". */
export function timeZoneLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(date).find(p => p.type === "timeZoneName")?.value ?? "";
}

/** "2026-12-12": the calendar day in the given zone, for grouping events by day. */
export function dayKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Month ("Dec") and day ("12") for the little date tile on event cards. */
export function dateTile(date: Date, timeZone: string) {
  return {
    month: date.toLocaleDateString("en-US", { month: "short", timeZone }),
    day: date.toLocaleDateString("en-US", { day: "numeric", timeZone })
  };
}

/** One line for lists: "Sat, Dec 12, 2026 · 7:00 PM EST". */
export function eventWhenShort(evt: Pick<EventRecord, "startsAt" | "timezone">): string {
  const start = eventStart(evt);
  if (!start) return "Date to be announced";
  const timeZone = eventTimeZone(evt);
  return `${formatDate(start, { timeZone })} · ${formatTime(start, { timeZone })} ${timeZoneLabel(start, timeZone)}`.trim();
}

/** Date and time range for the detail page: { date: "Sat, Dec 12, 2026", time: "7:00 PM – 9:00 PM EST" }. */
export function eventWhenLong(evt: Pick<EventRecord, "startsAt" | "endsAt" | "timezone">): { date: string; time: string } | null {
  const start = eventStart(evt);
  if (!start) return null;
  const end = eventEnd(evt);
  const timeZone = eventTimeZone(evt);
  const zone = timeZoneLabel(start, timeZone);
  const date = formatDate(start, { timeZone });
  if (!end) return { date, time: `${formatTime(start, { timeZone })} ${zone}`.trim() };
  if (dayKey(start, timeZone) === dayKey(end, timeZone)) {
    return { date, time: `${formatTime(start, { timeZone })} – ${formatTime(end, { timeZone })} ${zone}`.trim() };
  }
  return {
    date: `${date} – ${formatDate(end, { timeZone })}`,
    time: `${formatTime(start, { timeZone })} – ${formatTime(end, { timeZone })} ${zone}`.trim()
  };
}
