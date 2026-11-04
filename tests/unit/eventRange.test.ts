import { describe, expect, it } from "vitest";
import { parseEventRange, startsInRange } from "@/app/api/organizations/[orgSlug]/events/eventRange";
import { nextEvents } from "@/src/components/public/events/eventDates";

const params = (query: string) => new URLSearchParams(query);

describe("events API range", () => {
  it("accepts no range, ISO dates and date-times", () => {
    expect(parseEventRange(params(""))).toMatchObject({ ok: true, range: { start: null, end: null }, rangeStart: null, rangeEnd: null });
    const parsed = parseEventRange(params("rangeStart=2026-12-01&rangeEnd=2026-12-31T23:59:59Z"));
    expect(parsed).toMatchObject({ ok: true, rangeStart: "2026-12-01T00:00:00.000Z", rangeEnd: "2026-12-31T23:59:59.000Z" });
  });

  it("rejects dates it can't read (a 400, not a failed query)", () => {
    expect(parseEventRange(params("rangeStart=soon"))).toEqual({ ok: false, error: "rangeStart is not a valid date" });
    expect(parseEventRange(params("rangeEnd=2026-13-45"))).toEqual({ ok: false, error: "rangeEnd is not a valid date" });
  });

  it("filters by start date, inclusive, and leaves undated events out only when a bound is set", () => {
    const range = { start: Date.UTC(2026, 11, 1), end: Date.UTC(2026, 11, 31) };
    expect(startsInRange({ startsAt: Date.UTC(2026, 11, 1) }, range)).toBe(true);
    expect(startsInRange({ startsAt: Date.UTC(2026, 10, 30) }, range)).toBe(false);
    expect(startsInRange({ startsAt: Date.UTC(2027, 0, 1) }, range)).toBe(false);
    expect(startsInRange({ startsAt: null }, range)).toBe(false);
    expect(startsInRange({ startsAt: null }, { start: null, end: null })).toBe(true);
  });
});

describe("Home next events", () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 11, 12, 23);
  const events = [
    { id: "ended", startsAt: now - 3 * HOUR, endsAt: now - HOUR },
    { id: "running", startsAt: now - HOUR, endsAt: now + HOUR },
    { id: "soon", startsAt: now + HOUR },
    { id: "later", startsAt: now + 48 * HOUR },
    { id: "tba", startsAt: null }
  ];

  it("keeps the next ones by the given clock, in order, up to the limit", () => {
    expect(nextEvents(events, now, 3).map(e => e.id)).toEqual(["running", "soon", "later"]);
    // An hour later (a cached copy seen later): the running event has ended and a spare takes its place.
    expect(nextEvents(events, now + 2 * HOUR, 3).map(e => e.id)).toEqual(["later", "tba"]);
    expect(nextEvents(events, now, 0)).toEqual([]);
  });
});
