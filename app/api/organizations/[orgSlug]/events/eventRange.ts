/**
 * The events API's `rangeStart` / `rangeEnd` query parameters. Each is optional; when given it must be a date
 * that JavaScript can read (an ISO string such as "2026-12-01" or "2026-12-01T00:00:00Z"), otherwise the API
 * answers 400 instead of failing inside the query (R4 P10).
 */
export type EventRange = { start: number | null; end: number | null };

export type RangeResult = { ok: true; range: EventRange; rangeStart: string | null; rangeEnd: string | null } | { ok: false; error: string };

function parseParam(value: string | null): number | null | undefined {
  if (value === null || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function parseEventRange(searchParams: URLSearchParams): RangeResult {
  const rawStart = searchParams.get("rangeStart");
  const rawEnd = searchParams.get("rangeEnd");
  const start = parseParam(rawStart);
  const end = parseParam(rawEnd);
  if (start === undefined) return { ok: false, error: "rangeStart is not a valid date" };
  if (end === undefined) return { ok: false, error: "rangeEnd is not a valid date" };
  return {
    ok: true,
    range: { start, end },
    rangeStart: start === null ? null : new Date(start).toISOString(),
    rangeEnd: end === null ? null : new Date(end).toISOString()
  };
}

/** Epoch millis of a start date as the public loader sends it (millis, or anything Date can read); null if none. */
function startMillis(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? value : new Date(value as string | Date).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True when the event starts inside the range (inclusive). With any bound set, events without a date are left out, as the query does. */
export function startsInRange(event: { startsAt?: unknown }, range: EventRange): boolean {
  if (range.start === null && range.end === null) return true;
  const start = startMillis(event.startsAt);
  if (start === null) return false;
  if (range.start !== null && start < range.start) return false;
  if (range.end !== null && start > range.end) return false;
  return true;
}
