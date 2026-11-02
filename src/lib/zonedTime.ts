/**
 * Wall-clock times in a named time zone, without a date library.
 *
 * Event forms use <input type="datetime-local">, which has no time zone ("2026-12-12T19:00"). These helpers
 * read and write that value in the event's own zone (e.g. America/New_York), so 7:00 PM means 7:00 PM in
 * Harrisburg whatever the browser's or server's zone is.
 */

const WALL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
/** True when a date string carries its own zone ("Z" or "+05:45"). */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function isValidTimeZone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function wallParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds (New York in winter: -5 h). */
function zoneOffset(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * "2026-12-12T19:00" in `timeZone` → the exact instant. Returns null for an empty or malformed value.
 * A time skipped when clocks go forward moves an hour later; a repeated time when clocks go back takes the first.
 */
export function wallTimeToDate(value: string, timeZone: string): Date | null {
  const m = WALL_PATTERN.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(v => Number(v ?? 0));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(asUtc)) return null;
  // The zone's offset is one of the two in force half a day either side; try both.
  const offsets = [zoneOffset(asUtc - 12 * 3600_000, timeZone), zoneOffset(asUtc + 12 * 3600_000, timeZone)];
  const candidates = [...new Set(offsets)].map(offset => asUtc - offset);
  const wall = value.trim().slice(0, 16);
  const exact = candidates.filter(ms => dateToWallTime(ms, timeZone) === wall);
  // Ambiguous (clocks go back): the earlier instant. Skipped (clocks go forward): the later one.
  const ms = exact.length ? Math.min(...exact) : Math.max(...candidates);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An instant → "2026-12-12T19:00" as the wall clock reads in `timeZone` (for datetime-local inputs). */
export function dateToWallTime(value: Date | number, timeZone: string): string {
  const ms = typeof value === "number" ? value : value.getTime();
  if (!Number.isFinite(ms)) return "";
  const p = wallParts(ms, timeZone);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Server-side reading of a date sent by a form: strings with their own zone are taken as they are;
 * zone-less wall times ("2026-12-12T19:00") are read in `timeZone`. Returns null when unreadable.
 */
export function parseEventDate(value: string, timeZone: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  if (HAS_ZONE.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return wallTimeToDate(raw, timeZone);
}
