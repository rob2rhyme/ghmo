import { describe, expect, it } from "vitest";
import { humanizeRole, resolveActorLabel, resolveActorName } from "@/src/lib/actor";

describe("humanizeRole", () => {
  it("is empty for no role", () => {
    expect(humanizeRole()).toBe("");
    expect(humanizeRole(null)).toBe("");
    expect(humanizeRole("")).toBe("");
  });

  it("uses the known labels, ignoring case", () => {
    expect(humanizeRole("admin")).toBe("Admin");
    expect(humanizeRole("SUPER_ADMIN")).toBe("Super admin");
    expect(humanizeRole("Developer")).toBe("Developer");
    expect(humanizeRole("member")).toBe("Member");
    expect(humanizeRole("system")).toBe("System");
  });

  it("title-cases unknown roles, splitting on underscores and hyphens", () => {
    expect(humanizeRole("event_coordinator")).toBe("Event Coordinator");
    expect(humanizeRole("vice-PRESIDENT")).toBe("Vice President");
    expect(humanizeRole("__treasurer--chair_")).toBe("Treasurer Chair");
    expect(humanizeRole("secretary")).toBe("Secretary");
  });
});

describe("resolveActorName", () => {
  it("falls back to Admin when nothing is known", () => {
    expect(resolveActorName(null)).toBe("Admin");
    expect(resolveActorName(undefined)).toBe("Admin");
    expect(resolveActorName("")).toBe("Admin");
    expect(resolveActorName({})).toBe("Admin");
  });

  it("uses a plain string name but never shows an email address", () => {
    expect(resolveActorName("Ram Thapa")).toBe("Ram Thapa");
    expect(resolveActorName("ram@example.org")).toBe("Admin");
  });

  it("uses a trimmed name, skipping blank names and email-shaped names", () => {
    expect(resolveActorName({ name: "  Sita Magar  " })).toBe("Sita Magar");
    expect(resolveActorName({ name: "   ", role: "member" })).toBe("Member");
    expect(resolveActorName({ name: "sita@example.org", role: "developer" })).toBe("Developer");
    expect(resolveActorName({ name: "sita@example.org" })).toBe("Admin");
  });

  it("never falls back to the email or uid", () => {
    expect(resolveActorName({ email: "sita@example.org", uid: "uid-1" })).toBe("Admin");
  });

  it("prefers the first of roles, then role, then type", () => {
    expect(resolveActorName({ roles: ["super_admin", "member"], role: "member", type: "system" })).toBe("Super admin");
    expect(resolveActorName({ roles: [], role: "member", type: "system" })).toBe("Member");
    expect(resolveActorName({ roles: null, role: null, type: "system" })).toBe("System");
    expect(resolveActorName({ type: "board_member" })).toBe("Board Member");
  });

  it("follows a nested actor object", () => {
    expect(resolveActorName({ name: "Outer", actor: { name: "Inner" } })).toBe("Inner");
    expect(resolveActorName({ actor: { actor: { role: "developer" } } })).toBe("Developer");
  });

  it("ignores a nested actor that is not an object", () => {
    expect(resolveActorName({ name: "Outer", actor: "Inner" })).toBe("Outer");
    expect(resolveActorName({ name: "Outer", actor: null })).toBe("Outer");
  });
});

describe("resolveActorLabel", () => {
  it("is just the name for strings and empty actors", () => {
    expect(resolveActorLabel("Ram Thapa")).toBe("Ram Thapa");
    expect(resolveActorLabel("ram@example.org")).toBe("Admin");
    expect(resolveActorLabel(null)).toBe("Admin");
    expect(resolveActorLabel({})).toBe("Admin");
  });

  it("adds the role in brackets after a name", () => {
    expect(resolveActorLabel({ name: "Sita Magar", role: "super_admin" })).toBe("Sita Magar (Super admin)");
    expect(resolveActorLabel({ name: "Sita Magar", roles: ["event_lead"] })).toBe("Sita Magar (Event Lead)");
  });

  it("does not repeat the role when it is already the name", () => {
    expect(resolveActorLabel({ role: "admin" })).toBe("Admin");
    expect(resolveActorLabel({ name: "sita@example.org", role: "member" })).toBe("Member");
  });

  it("is the name alone when there is no role", () => {
    expect(resolveActorLabel({ name: "Sita Magar" })).toBe("Sita Magar");
  });

  it("takes the role from the outer object even when the name comes from a nested actor", () => {
    expect(resolveActorLabel({ role: "developer", actor: { name: "Inner" } })).toBe("Inner (Developer)");
    expect(resolveActorLabel({ actor: { name: "Inner", role: "developer" } })).toBe("Inner");
  });
});
