import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatShortDate, formatTime, toDate } from "@/src/lib/format";

const NY = { timeZone: "America/New_York" };
const ms = Date.UTC(2026, 11, 13, 0, 0); // Dec 12, 7:00 PM in New York

describe("format", () => {
  it("reads millis, seconds, ISO strings, Dates and Timestamp-like values", () => {
    expect(toDate(ms)?.getTime()).toBe(ms);
    expect(toDate(ms / 1000)?.getTime()).toBe(ms);
    expect(toDate(new Date(ms).toISOString())?.getTime()).toBe(ms);
    expect(toDate({ toDate: () => new Date(ms) })?.getTime()).toBe(ms);
    expect(toDate({ _seconds: ms / 1000 })?.getTime()).toBe(ms);
    expect(toDate({ seconds: ms / 1000 })?.getTime()).toBe(ms);
  });

  it("returns empty text for missing or invalid dates, never 'Invalid Date'", () => {
    for (const value of [null, undefined, "", "nonsense", {}]) {
      expect(formatDateTime(value as never)).toBe("");
    }
  });

  it("formats without seconds", () => {
    expect(formatDate(ms, NY)).toBe("Sat, Dec 12, 2026");
    expect(formatShortDate(ms, NY)).toBe("Dec 12, 2026");
    expect(formatTime(ms, NY)).toBe("7:00 PM");
    expect(formatDateTime(ms, NY)).toBe("Sat, Dec 12, 2026 · 7:00 PM");
  });
});
