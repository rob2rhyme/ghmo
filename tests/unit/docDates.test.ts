// Run as if in Harrisburg: before the fix, "2026-11-04" printed as November 3 here.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";

describe("typed dates in documents (TZ=America/New_York)", () => {
  it("runs in a zone where midnight UTC is still the day before", () => {
    // The trap: new Date("YYYY-MM-DD") is midnight UTC, the previous evening in Harrisburg.
    expect(new Date("2026-11-04").getDate()).toBe(3);
  });

  it("prints a typed date as that calendar day", async () => {
    const { formatDate } = await import("@/src/features/docgen/render/renderTemplateHtml");
    expect(formatDate("2026-11-04")).toBe("November 4, 2026");
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
    expect(formatDate(" 2026-03-08 ")).toBe("March 8, 2026");
  });

  it("still prints a moment (ISO with a time) as the local day, and leaves other text as typed", async () => {
    const { formatDate } = await import("@/src/features/docgen/render/renderTemplateHtml");
    expect(formatDate("2026-10-12T12:00:00Z")).toBe("October 12, 2026");
    // 02:00 UTC on the 13th is still the evening of the 12th in Harrisburg.
    expect(formatDate("2026-10-13T02:00:00Z")).toBe("October 12, 2026");
    expect(formatDate("2026-02-31")).toBe("2026-02-31");
    expect(formatDate("next <Tuesday>")).toBe("next &lt;Tuesday&gt;");
    expect(formatDate("")).toBe("");
  });

  it("prints the right day in every template and in the minutes", async () => {
    const { TEMPLATES } = await import("@/src/features/docgen/templates");
    const byId = (id: string) => TEMPLATES.find(t => t.id === id)!;
    expect(byId("wedding-certificate").renderHtml({ marriageDate: "2026-11-04" })).toContain("November 4, 2026");
    expect(byId("death-certificate").renderHtml({ deceasedName: "Maya Pun", dateOfPassing: "2026-11-04" })).toContain("on November 4, 2026.");
    expect(byId("meeting-member-invitation").renderHtml({ meetingDate: "2026-11-04" })).toContain("on November 4, 2026");
    expect(byId("board_meeting_invitation").renderHtml({ meetingDate: "2026-11-04" })).toContain("on November 4, 2026");
    expect(byId("event-host-invitation").renderHtml({ eventDate: "2026-11-04" })).toContain("on November 4, 2026");
    expect(byId("bhajan_program").renderHtml({ programDate: "2026-11-04" })).toContain("November 4, 2026");

    const { buildMinutesHtml } = await import("@/src/features/minutes/components/MinutesPreview");
    const minutes = buildMinutesHtml({ agenda: [], decisions: [], actionItems: [{ task: "Book the hall", dueDate: "2026-11-04" }] });
    expect(minutes).toContain("(due November 4, 2026)");
  });
});
