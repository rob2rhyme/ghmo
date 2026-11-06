import { describe, expect, it } from "vitest";
import { calendarResponse, toIcsEvent } from "@/src/lib/calendarResponse";
import type { EventRecord } from "@/src/lib/events.shared";

const ORIGIN = "https://ghmo.example.org";
const START = Date.UTC(2026, 11, 1, 18, 0, 0);
const END = Date.UTC(2026, 11, 1, 20, 0, 0);
const UPDATED = Date.UTC(2026, 10, 1, 12, 0, 0);

const timestamp = (ms: number) => ({ toDate: () => new Date(ms) });

const event = (overrides: Partial<EventRecord> = {}): EventRecord => ({
  id: "evt1",
  title: "Lhosar",
  body: "",
  status: "published",
  ...overrides
});

describe("toIcsEvent", () => {
  it("converts Firestore-style timestamps to milliseconds and builds the event URL", () => {
    expect(
      toIcsEvent(
        event({ summary: "Celebration", location: "Hall", startsAt: timestamp(START), endsAt: timestamp(END), updatedAt: timestamp(UPDATED) }),
        ORIGIN
      )
    ).toEqual({
      id: "evt1",
      title: "Lhosar",
      summary: "Celebration",
      location: "Hall",
      startsAt: START,
      endsAt: END,
      updatedAt: UPDATED,
      url: "https://ghmo.example.org/c/ghmo/events/evt1"
    });
  });

  it("accepts Dates, ISO strings and numbers", () => {
    expect(toIcsEvent(event({ startsAt: new Date(START) }), ORIGIN)?.startsAt).toBe(START);
    expect(toIcsEvent(event({ startsAt: new Date(START).toISOString() }), ORIGIN)?.startsAt).toBe(START);
    expect(toIcsEvent(event({ startsAt: START }), ORIGIN)?.startsAt).toBe(START);
  });

  it("returns null without a usable start", () => {
    expect(toIcsEvent(event(), ORIGIN)).toBeNull();
    expect(toIcsEvent(event({ startsAt: null }), ORIGIN)).toBeNull();
    expect(toIcsEvent(event({ startsAt: "" }), ORIGIN)).toBeNull();
    expect(toIcsEvent(event({ startsAt: "not a date" }), ORIGIN)).toBeNull();
    expect(toIcsEvent(event({ startsAt: timestamp(Number.NaN) }), ORIGIN)).toBeNull();
  });

  it("leaves a missing or invalid end and update time undefined", () => {
    const ics = toIcsEvent(event({ startsAt: START, endsAt: "garbage" }), ORIGIN);
    expect(ics?.endsAt).toBeUndefined();
    expect(ics?.updatedAt).toBeUndefined();
  });

  it("does not carry private fields such as the body or creator", () => {
    const ics = toIcsEvent(event({ startsAt: START, body: "secret body", createdByUid: "uid-1" }), ORIGIN);
    expect(ics).not.toHaveProperty("body");
    expect(ics).not.toHaveProperty("createdByUid");
    expect(ics).not.toHaveProperty("status");
  });
});

describe("calendarResponse", () => {
  it("sets calendar headers with the file name", () => {
    const res = calendarResponse([], ORIGIN, "ghmo-events.ics");
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="ghmo-events.ics"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=60");
    expect(res.status).toBe(200);
  });

  it("includes only events with a start, named after the origin host", async () => {
    const res = calendarResponse(
      [event({ id: "has-start", title: "Kept", startsAt: timestamp(START) }), event({ id: "no-start", title: "Dropped" })],
      ORIGIN,
      "e.ics"
    );
    const body = await res.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("X-WR-CALNAME:GHMO Events");
    expect(body).toContain("UID:has-start@ghmo.example.org");
    expect(body).toContain("SUMMARY:Kept");
    expect(body).toContain("URL:https://ghmo.example.org/c/ghmo/events/has-start");
    expect(body).not.toContain("no-start");
    expect(body).not.toContain("Dropped");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("keeps the port in the UID host", async () => {
    const body = await calendarResponse([event({ startsAt: START })], "http://localhost:3000", "e.ics").text();
    expect(body).toContain("UID:evt1@localhost:3000");
  });

  it("throws on an origin that is not a URL", () => {
    expect(() => calendarResponse([], "not a url", "e.ics")).toThrow();
  });
});
