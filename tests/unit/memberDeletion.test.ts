import { describe, expect, it } from "vitest";
import { EMPTY_COUNTS, confirmationMatches, confirmationTarget, deletionSummary, newMemberSuppression, suppressionToKeep } from "@/src/lib/memberDeletion";

describe("confirmationMatches", () => {
  const member = { name: "Maya Gurung", emailLower: "maya@example.org" };

  it("accepts the name, ignoring case and spacing", () => {
    expect(confirmationMatches("Maya Gurung", member)).toBe(true);
    expect(confirmationMatches("  maya   GURUNG ", member)).toBe(true);
  });

  it("refuses anything else, including the email when there is a name", () => {
    expect(confirmationMatches("Maya", member)).toBe(false);
    expect(confirmationMatches("maya@example.org", member)).toBe(false);
    expect(confirmationMatches("", member)).toBe(false);
    expect(confirmationMatches(undefined, member)).toBe(false);
    expect(confirmationMatches(42, member)).toBe(false);
  });

  it("uses the email when there is no name, and never accepts an empty target", () => {
    expect(confirmationMatches("Sam@Example.org", { name: null, emailLower: "sam@example.org" })).toBe(true);
    expect(confirmationTarget({ name: null, emailLower: "sam@example.org" })).toBe("sam@example.org");
    expect(confirmationMatches("", { name: null, emailLower: "" })).toBe(false);
    expect(confirmationMatches("anything", { name: "", emailLower: "" })).toBe(false);
  });
});

describe("deletionSummary", () => {
  it("always lists the record, and leaves out what is not there", () => {
    const { removed, kept } = deletionSummary(EMPTY_COUNTS);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain("Their record");
    expect(kept).toHaveLength(2);
  });

  it("counts each kind in plain words, singular and plural", () => {
    const { removed, kept } = deletionSummary({ ...EMPTY_COUNTS, notes: 1, callRows: 2, callAttempts: 3, assignment: 1, deliveries: 4, reminders: 1, tasks: 2, groups: 2, groupsLed: 1, officerTerms: 1 });
    expect(removed).toContain("1 note");
    expect(removed.some(line => line.startsWith("2 call records in campaigns, with 3 attempts"))).toBe(true);
    expect(removed).toContain("Their place in the calling tree");
    expect(removed).toContain("4 broadcast delivery records");
    expect(removed).toContain("1 task reminder record");
    expect(removed).toContain("Their name on 2 tasks");
    expect(removed).toContain("Their place in 2 groups (and as lead of 1)");
    expect(kept[0]).toBe('1 officer term stay as history, shown as "Removed member"');
  });

  it("mentions a group they only led", () => {
    expect(deletionSummary({ ...EMPTY_COUNTS, groupsLed: 1 }).removed).toContain("Being lead of 1 group");
  });
});

describe("do-not-email records (D44)", () => {
  it("are kept for an opt-out, a complaint or a bounce, and only when there is an address", () => {
    expect(suppressionToKeep({ emailLower: "a@b.org", emailOptOutAt: new Date() })).toBe("opted_out");
    expect(suppressionToKeep({ emailLower: "a@b.org", emailBounced: true })).toBe("bounced");
    expect(suppressionToKeep({ emailLower: "a@b.org", emailOptOutAt: new Date(), emailBounced: true })).toBe("opted_out");
    expect(suppressionToKeep({ emailLower: "a@b.org" })).toBeNull();
    expect(suppressionToKeep({ emailLower: "", emailOptOutAt: new Date() })).toBeNull();
  });

  it("start a re-added member opted out or bounced, never ready", () => {
    const at = new Date("2026-01-02T03:04:05Z");
    expect(newMemberSuppression(null)).toEqual({});
    expect(newMemberSuppression({ reason: "opted_out", at })).toEqual({ emailOptOutAt: at });
    expect(newMemberSuppression({ reason: "bounced", at })).toEqual({ emailBounced: true });
  });
});
