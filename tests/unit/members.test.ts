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
