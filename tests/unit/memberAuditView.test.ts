import { describe, expect, it } from "vitest";
import { memberAuditView } from "@/src/lib/memberContact.server";

describe("memberAuditView", () => {
  it("never keeps an email address, only whether there is one", () => {
    const view = memberAuditView({ name: "Maya Gurung", email: "Maya@Example.org", emailLower: "maya@example.org", status: "active" });
    expect(view).toEqual({ name: "Maya Gurung", status: "active", hasEmail: true });
    expect(JSON.stringify(view)).not.toMatch(/example\.org/i);
  });

  it("says when a member has no email", () => {
    expect(memberAuditView({ name: "Hari", emailLower: "" })).toEqual({ name: "Hari", hasEmail: false });
  });

  it("replaces the encrypted contact with a marker", () => {
    expect(memberAuditView({ name: "A", contact: { v: 1, ct: "x" } })).toEqual({ name: "A", contact: "[encrypted]" });
    expect(memberAuditView({ name: "A", contact: null })).toEqual({ name: "A", contact: null });
  });

  it("leaves other fields alone and adds nothing when there is no email field", () => {
    expect(memberAuditView({ id: "m1", city: "Harrisburg" })).toEqual({ id: "m1", city: "Harrisburg" });
  });
});
