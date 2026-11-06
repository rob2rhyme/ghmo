import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "@/src/lib/ics";

const start = Date.UTC(2026, 5, 6, 18, 30);
const options = { name: "GHMO Events", host: "ghmo.example", now: Date.UTC(2026, 0, 1) };

describe("ics", () => {
  it("escapes characters that have meaning in iCalendar", () => {
    expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    // RFC 5545: a semicolon in text needs a real backslash before it (this test once expected "\;", which is just ";").
    expect(escapeText("x;y")).toBe("x\\;y");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const folded = foldLine(`SUMMARY:${"नमस्ते ".repeat(20)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"नमस्ते ".repeat(20)}`);
  });

  it("builds a valid calendar with UTC times and a default one-hour length", () => {
    const ics = buildCalendar([{ id: "ev1", title: "Bhajan, evening", location: "Hall; Main St", startsAt: start }], options);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:ev1@ghmo.example\r\n");
    expect(ics).toContain("DTSTART:20260606T183000Z\r\n");
    expect(ics).toContain("DTEND:20260606T193000Z\r\n");
    expect(ics).toContain("SUMMARY:Bhajan\\, evening\r\n");
    expect(ics).toContain("LOCATION:Hall\\; Main St\r\n");
    expect(ics.split("\n").every(line => line === "" || line.endsWith("\r"))).toBe(true);
  });

  it("uses the real end time when it is later, and skips events without a start", () => {
    const ics = buildCalendar([{ id: "a", title: "A", startsAt: start, endsAt: start + 3 * 3600_000 }, { id: "b", title: "B", startsAt: NaN }], options);
    expect(ics).toContain("DTEND:20260606T213000Z");
    expect(ics).not.toContain("UID:b@");
  });

  it("can't be given extra properties through a title", () => {
    const ics = buildCalendar([{ id: "x", title: "Hi\r\nATTENDEE:mailto:evil@example.com", startsAt: start }], options);
    expect(ics).not.toContain("\r\nATTENDEE:");
  });
});
