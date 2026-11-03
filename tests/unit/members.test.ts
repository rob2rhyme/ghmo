import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, isEmailConsentSource, memberEmailState, parseMemberCsv } from "@/src/lib/members";

const consented = { status: "active", emailLower: "a@example.org", emailConsent: { source: "admin_on_request" } };

describe("memberEmailState", () => {
  it("only emails active members with a recorded consent", () => {
    expect(memberEmailState(consented)).toBe("ready");
    expect(memberEmailState({ ...consented, emailConsent: undefined })).toBe("no_consent");
    expect(memberEmailState({ ...consented, emailConsent: { source: "made-up" } })).toBe("no_consent");
    expect(memberEmailState({ ...consented, emailConsent: null })).toBe("no_consent");
  });

  it("an opt-out or a bounce beats consent", () => {
    expect(memberEmailState({ ...consented, emailOptOutAt: new Date() })).toBe("opted_out");
    expect(memberEmailState({ ...consented, emailBounced: true })).toBe("bounced");
    expect(memberEmailState({ ...consented, emailOptOutAt: new Date(), emailBounced: true })).toBe("opted_out");
  });

  it("disabled members and members without an address are inactive, whatever else is set", () => {
    expect(memberEmailState({ ...consented, status: "disabled" })).toBe("inactive");
    expect(memberEmailState({ ...consented, emailLower: "" })).toBe("inactive");
    expect(memberEmailState({ ...consented, emailLower: undefined })).toBe("inactive");
    expect(memberEmailState({ status: "disabled", emailLower: "a@example.org", emailOptOutAt: new Date() })).toBe("inactive");
  });

  it("knows the allowed consent sources", () => {
    expect(isEmailConsentSource("imported")).toBe(true);
    expect(isEmailConsentSource("signed_up")).toBe(true);
    expect(isEmailConsentSource("nope")).toBe(false);
    expect(isEmailConsentSource(undefined)).toBe(false);
  });
});

describe("parseMemberCsv", () => {
  it("reads a header row with email and name columns in any order", () => {
    const result = parseMemberCsv("Name,Email\nSam Lee,SAM@Example.org\n\"Lee, Pat\",pat@example.org\n");
    expect(result.rows).toEqual([
      { email: "sam@example.org", name: "Sam Lee" },
      { email: "pat@example.org", name: "Lee, Pat" }
    ]);
    expect(result.problems).toEqual([]);
  });

  it("reads plain lists with no header, with or without a name", () => {
    const result = parseMemberCsv("a@example.org\nSam Lee,b@example.org\nc@example.org,Cy\r\n");
    expect(result.rows).toEqual([{ email: "a@example.org" }, { email: "b@example.org", name: "Sam Lee" }, { email: "c@example.org", name: "Cy" }]);
  });

  it("skips bad addresses and in-file duplicates, and says which lines", () => {
    const result = parseMemberCsv("email\nnot-an-email\na@example.org\nA@example.org\nspace in@example.org\n");
    expect(result.rows).toEqual([{ email: "a@example.org" }]);
    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toContain("Line 2");
    expect(result.problems[1]).toContain("Line 4");
  });

  it("ignores a byte-order mark and blank lines", () => {
    expect(parseMemberCsv("﻿email\n\n a@example.org \n").rows).toEqual([{ email: "a@example.org" }]);
  });

  it("caps the number of rows and reports it", () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => `u${i}@example.org`).join("\n");
    const result = parseMemberCsv(lines);
    expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(result.truncated).toBe(true);
  });

  it("returns nothing for empty input", () => {
    expect(parseMemberCsv("")).toEqual({ rows: [], problems: [], truncated: false });
  });
});

describe("phone numbers (plan §12, 9-A)", () => {
  it("normalizes US numbers and keeps international ones in E.164", async () => {
    const { normalizePhone } = await import("@/src/lib/members");
    expect(normalizePhone("(717) 555-0100")).toBe("+17175550100");
    expect(normalizePhone("1 717 555 0100")).toBe("+17175550100");
    expect(normalizePhone("+1 717-555-0100")).toBe("+17175550100");
    expect(normalizePhone("+977 9841 234567")).toBe("+9779841234567");
    expect(normalizePhone("555-0100")).toBeNull();
    expect(normalizePhone("+12")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });

  it("formats and masks for display", async () => {
    const { formatPhone, maskPhone } = await import("@/src/lib/members");
    expect(formatPhone("+17175550100")).toBe("(717) 555-0100");
    expect(formatPhone("+9779841234567")).toBe("+9779841234567");
    expect(maskPhone("+17175550100")).toBe("•••-•••-0100");
  });

  it("cleans a contact form and reports bad numbers without dropping the rest", async () => {
    const { normalizeContact } = await import("@/src/lib/members");
    const ok = normalizeContact({ phone: " 717-555-0100 ", altPhone: "", language: " Nepali ", household: "Thapa family", notes: "Evenings" });
    expect(ok).toEqual({ contact: { phone: "+17175550100", language: "Nepali", household: "Thapa family", notes: "Evenings" }, hasPhone: true, problems: [] });
    const bad = normalizeContact({ phone: "nope", altPhone: "717-555-0101" });
    expect(bad.contact).toEqual({ altPhone: "+17175550101" });
    expect(bad.hasPhone).toBe(false);
    expect(bad.problems).toHaveLength(1);
    expect(normalizeContact({ notes: "x".repeat(2000) }).contact.notes).toHaveLength(1000);
  });

  it("decides who may be given to a caller", async () => {
    const { memberCallState } = await import("@/src/lib/members");
    const ready = { status: "active", hasPhone: true, phoneConsent: { source: "admin_on_request" } };
    expect(memberCallState(ready)).toBe("ready");
    expect(memberCallState({ ...ready, callOptOutAt: new Date() })).toBe("opted_out");
    expect(memberCallState({ ...ready, phoneConsent: null })).toBe("no_consent");
    expect(memberCallState({ ...ready, hasPhone: false })).toBe("no_phone");
    expect(memberCallState({ ...ready, status: "disabled", callOptOutAt: new Date() })).toBe("inactive");
  });

  it("binds the contact envelope to the member id", async () => {
    const { memberContactLoc } = await import("@/src/lib/members");
    expect(memberContactLoc("abc")).toEqual({ path: "organizations/ghmo/members", docId: "abc#contact" });
  });
});

describe("parseMemberCsv with a phone column", () => {
  it("reads a phone header in any order and normalizes it", () => {
    const result = parseMemberCsv("Phone,Email,Name\n(717) 555-0100,sam@example.org,Sam\n,pat@example.org,Pat\n");
    expect(result.rows).toEqual([
      { email: "sam@example.org", name: "Sam", phone: "+17175550100" },
      { email: "pat@example.org", name: "Pat" }
    ]);
  });

  it("finds a phone in a headerless line and keeps the name", () => {
    const result = parseMemberCsv("Sam Lee,sam@example.org,717-555-0100\n717 555 0101,pat@example.org\n");
    expect(result.rows).toEqual([
      { email: "sam@example.org", name: "Sam Lee", phone: "+17175550100" },
      { email: "pat@example.org", phone: "+17175550101" }
    ]);
  });

  it("imports the person without the number when it is not recognized, and says so", () => {
    const result = parseMemberCsv("email,phone\nsam@example.org,555-01\n");
    expect(result.rows).toEqual([{ email: "sam@example.org" }]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("Line 2");
    expect(result.problems[0]).toContain("imported without one");
  });
});
