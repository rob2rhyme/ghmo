import { describe, expect, it } from "vitest";
import { attendanceCsv } from "@/src/lib/attendanceCsv";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";

const record = (over: Partial<MeetingMinutesRecord>): MeetingMinutesRecord =>
  ({ id: "m", eventId: "e", eventTitle: "Board", meetingType: "Board", recordedBy: "A", agenda: [], decisions: [], actionItems: [], status: "approved", createdAt: 0, ...over }) as MeetingMinutesRecord;

describe("attendance export", () => {
  it("writes one row per person, oldest meeting first", () => {
    const csv = attendanceCsv([
      record({ eventTitle: "Later", eventDate: Date.UTC(2026, 5, 1), attendance: { present: ["Ann"] } }),
      record({ eventTitle: "Earlier", eventDate: Date.UTC(2026, 0, 1), attendance: { present: ["Bo"], absent: ["Cy"], guests: ["Di"] } })
    ]).split("\r\n");
    expect(csv[0]).toBe("Date,Event,Meeting type,Minutes status,Name,Attendance");
    expect(csv.slice(1, 5)).toEqual([
      "2026-01-01,Earlier,Board,approved,Bo,Present",
      "2026-01-01,Earlier,Board,approved,Cy,Absent",
      "2026-01-01,Earlier,Board,approved,Di,Guest",
      "2026-06-01,Later,Board,approved,Ann,Present"
    ]);
  });

  it("quotes commas and quotes, and defuses spreadsheet formulas", () => {
    const csv = attendanceCsv([record({ eventTitle: 'Q1, "annual"', attendance: { present: ["=HYPERLINK(\"http://evil\")", "+1 555", "Normal"] } })]);
    expect(csv).toContain('"Q1, ""annual"""');
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csv).toContain("'+1 555");
    expect(csv).toContain(",Normal,Present");
  });

  it("is just a header when nobody attended", () => {
    expect(attendanceCsv([record({})])).toBe("Date,Event,Meeting type,Minutes status,Name,Attendance\r\n");
  });
});
