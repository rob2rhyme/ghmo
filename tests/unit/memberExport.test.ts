import { describe, expect, it } from "vitest";
import { csvCell, exportColumns, exportFileName, membersCsv, type ExportMember } from "@/src/lib/memberExport";
import { parseMemberCsv } from "@/src/lib/members";

const member = (over: Partial<ExportMember> = {}): ExportMember => ({
  name: "Sam Lee",
  email: "sam@example.org",
  status: "active",
  memberSince: "2019-03-02",
  city: "Harrisburg",
  state: "PA",
  groups: ["Cooking", "Phone tree callers"],
  positions: ["President"],
  emailState: "ready",
  callState: "ready",
  contact: { phone: "+17175550100", altPhone: "+447911123456", language: "Nepali", household: "Lee home" },
  ...over
});

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Lee, Sam")).toBe('"Lee, Sam"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    for (const text of ["+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\tcmd"]) expect(csvCell(text).startsWith("'") || csvCell(text).startsWith('"\'')).toBe(true);
  });

  it("leaves a phone number that is only digits and punctuation alone, but still guards other text in that column", () => {
    expect(csvCell("+447911123456", { phone: true })).toBe("+447911123456");
    expect(csvCell("(717) 555-0100", { phone: true })).toBe("(717) 555-0100");
    expect(csvCell("+1 (717) 555-0100", { phone: true })).toBe("+1 (717) 555-0100");
    expect(csvCell("+cmd|calc", { phone: true })).toBe("'+cmd|calc");
    expect(csvCell("+447911123456")).toBe("'+447911123456");
  });
});

describe("membersCsv", () => {
  it("starts with a byte order mark and uses CRLF", () => {
    const csv = membersCsv([member()], { includePhones: false });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("without phones has the plain facts and no contact columns or numbers", () => {
    const csv = membersCsv([member()], { includePhones: false });
    const [head, row] = lines(csv);
    expect(head).toBe("Name,Email,Status,Member since,City,State,Groups,Officer positions,Email status,Call status");
    expect(row).toBe("Sam Lee,sam@example.org,Active,2019-03-02,Harrisburg,PA,Cooking; Phone tree callers,President,Can be emailed,Can be called");
    expect(csv).not.toMatch(/555|7911|Nepali|Lee home/);
  });

  it("with phones adds the number, alternate, language and household, formatted for reading", () => {
    const [head, row] = lines(membersCsv([member()], { includePhones: true }));
    expect(head.startsWith("Name,Email,Phone,Alternate phone,Language,Household,Status")).toBe(true);
    expect(row.startsWith("Sam Lee,sam@example.org,(717) 555-0100,+447911123456,Nepali,Lee home,Active")).toBe(true);
  });

  it("leaves the contact cells empty for a member whose contact could not be opened or who has none", () => {
    const [, row] = lines(membersCsv([member({ contact: null })], { includePhones: true }));
    expect(row.startsWith("Sam Lee,sam@example.org,,,,,Active")).toBe(true);
  });

  it("never includes notes or family, even if the contact object carries them", () => {
    const contact = { phone: "+17175550100", notes: "Prefers mornings", family: [{ name: "Maya", phone: "+17175550102" }] } as unknown as ExportMember["contact"];
    const csv = membersCsv([member({ contact })], { includePhones: true });
    expect(csv).not.toMatch(/mornings|Maya|0102/);
  });

  it("writes disabled members and phone-only members honestly", () => {
    const rows = lines(membersCsv([member({ status: "disabled", emailState: "inactive", callState: "inactive" }), member({ email: "", name: "Maya Gurung", emailState: "no_email" })], { includePhones: false }));
    expect(rows[1]).toContain(",Turned off,");
    expect(rows[1]).toContain("Turned off,Turned off");
    expect(rows[2].startsWith("Maya Gurung,,Active")).toBe(true);
    expect(rows[2]).toContain("No email");
  });

  it("guards a name that would run as a formula", () => {
    const [, row] = lines(membersCsv([member({ name: "=1+1" })], { includePhones: false }));
    expect(row.startsWith("'=1+1,")).toBe(true);
  });

  it("can be imported again: the import reads the Name, Email and Phone columns it wrote", () => {
    const csv = membersCsv([member(), member({ email: "", name: "Maya Gurung", contact: { phone: "+17175550102" } })], { includePhones: true });
    const parsed = parseMemberCsv(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      { email: "sam@example.org", name: "Sam Lee", phone: "+17175550100" },
      { name: "Maya Gurung", phone: "+17175550102" }
    ]);
  });

  it("columns match the header", () => {
    expect(exportColumns(true)).toHaveLength(14);
    expect(exportColumns(false)).toHaveLength(10);
    expect(exportFileName("2026-11-06")).toBe("ghmo-members-2026-11-06.csv");
  });
});
