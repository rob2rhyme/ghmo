import { describe, expect, it } from "vitest";
import { dateToWallTime, isValidTimeZone, parseEventDate, wallTimeToDate } from "@/src/lib/zonedTime";

const NY = "America/New_York";
const KTM = "Asia/Kathmandu";

describe("zoned wall times", () => {
  it("reads 7:00 PM in the event's zone, whatever the machine's zone", () => {
    expect(wallTimeToDate("2026-12-12T19:00", NY)?.toISOString()).toBe("2026-12-13T00:00:00.000Z"); // EST, UTC-5
    expect(wallTimeToDate("2026-07-04T19:00", NY)?.toISOString()).toBe("2026-07-04T23:00:00.000Z"); // EDT, UTC-4
    expect(wallTimeToDate("2026-12-12T19:00", KTM)?.toISOString()).toBe("2026-12-12T13:15:00.000Z"); // UTC+5:45
  });

  it("writes an instant back as the wall clock in that zone", () => {
    expect(dateToWallTime(Date.UTC(2026, 11, 13, 0, 0), NY)).toBe("2026-12-12T19:00");
    expect(dateToWallTime(new Date("2026-12-12T13:15:00Z"), KTM)).toBe("2026-12-12T19:00");
  });

  it("round-trips every hour across both daylight-saving changes", () => {
    for (const day of ["2026-03-08", "2026-11-01"]) {
      for (let h = 0; h < 24; h++) {
        const wall = `${day}T${String(h).padStart(2, "0")}:30`;
        const d = wallTimeToDate(wall, NY)!;
        // 2:30 AM on the spring-forward day doesn't exist; it moves to 3:30 AM.
        const expected = day === "2026-03-08" && h === 2 ? `${day}T03:30` : wall;
        expect(dateToWallTime(d, NY)).toBe(expected);
      }
    }
  });

  it("server parsing keeps explicit zones and reads bare wall times in the event zone", () => {
    expect(parseEventDate("2026-12-13T00:00:00.000Z", KTM)?.toISOString()).toBe("2026-12-13T00:00:00.000Z");
    expect(parseEventDate("2026-12-12T19:00-05:00", KTM)?.toISOString()).toBe("2026-12-13T00:00:00.000Z");
    expect(parseEventDate("2026-12-12T19:00", NY)?.toISOString()).toBe("2026-12-13T00:00:00.000Z");
    expect(parseEventDate("", NY)).toBeNull();
    expect(parseEventDate("nonsense", NY)).toBeNull();
  });

  it("checks time zone names", () => {
    expect(isValidTimeZone(NY)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
