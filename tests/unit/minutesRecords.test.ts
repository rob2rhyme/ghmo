import { describe, expect, it } from "vitest";
import { adminView, auditView, publicView } from "@/src/lib/minutesRecords";

const encrypted = {
  id: "m1",
  eventTitle: "Board",
  status: "approved",
  enc: { v: 1 },
  approvalEnc: { v: 1 },
  approvedByUid: "alice",
  published: { decisions: ["Buy the hall"], agenda: ["Hall"] }
};

describe("minutes views", () => {
  it("admin view merges the published copy and flags encrypted records", () => {
    const view = adminView(encrypted);
    expect(view).toMatchObject({ decisions: ["Buy the hall"], encrypted: true });
    expect(view.enc).toBeDefined();
  });

  it("gives drafts empty arrays instead of undefined so lists never crash", () => {
    expect(adminView({ id: "m2", status: "draft", enc: {} })).toMatchObject({ agenda: [], decisions: [], actionItems: [] });
  });

  it("public view never exposes ciphertext, notes or admin ids", () => {
    const view = publicView({ ...encrypted, approvalNotes: "private" });
    expect(view).toMatchObject({ decisions: ["Buy the hall"] });
    for (const key of ["enc", "approvalEnc", "approvalNotes", "approvedByUid", "published"]) expect(view).not.toHaveProperty(key);
  });

  it("audit view drops content and ciphertext", () => {
    const view = auditView({ ...encrypted, discussionSummary: "secret", agenda: ["x"] });
    expect(JSON.stringify(view)).not.toMatch(/secret|Buy the hall|"enc"/);
    expect(view).toMatchObject({ id: "m1", status: "approved" });
  });
});
