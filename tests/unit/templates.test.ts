import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/src/features/docgen/templates";

describe("document templates", () => {
  it("each has a unique id and a positive integer version", () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) expect(Number.isInteger(template.version) && template.version >= 1).toBe(true);
  });

  it("never prints placeholder text or a made-up contact when fields are left empty", () => {
    for (const template of TEMPLATES) {
      const html = template.renderHtml({});
      expect(html, template.id).not.toMatch(/TBD|Valued Member|Esteemed|@ghmo\.org|undefined|null/);
      expect(html, template.id).not.toMatch(/\b(on|at|of)\s*[.,]/);
    }
  });

  it("writes the letter around the fields that were filled in", () => {
    const member = TEMPLATES.find(t => t.id === "meeting-member-invitation")!;
    const html = member.renderHtml({ memberName: "Sita Gurung", meetingDate: "2026-10-12T12:00:00Z", rsvpLink: "717-555-0123" });
    expect(html).toContain("Dear Sita Gurung,");
    expect(html).toContain("on October 12, 2026");
    expect(html).toContain("Reply to: 717-555-0123");
    expect(html).not.toContain(" at ");

    const board = TEMPLATES.find(t => t.id === "board_meeting_invitation")!;
    expect(board.renderHtml({})).toContain("Dear board member,");
    expect(board.renderHtml({ agenda: "Bylaws <review>" })).toContain("On the agenda:<br/>Bylaws &lt;review&gt;");
  });
});
