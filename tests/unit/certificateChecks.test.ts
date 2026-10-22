import { describe, expect, it } from "vitest";
import { checkSigningSessions } from "@/src/lib/certificateChecks";

const sessions = { s1: { role: "witness1", certificateId: "C-1" }, s2: { role: "officiant", certificateId: "C-1" } };
const ok = { certificateId: "C-1", primarySessionId: "s1", signatures: { witness1: "s1", officiant: "s2" }, sessions };

describe("checkSigningSessions", () => {
  it("accepts signatures collected for this certificate and these roles", () => {
    expect(checkSigningSessions(ok)).toBeNull();
  });
  it("rejects a missing certificate number", () => {
    expect(checkSigningSessions({ ...ok, certificateId: " " })).toMatch(/certificate number/);
  });
  it("rejects a signature collected for another certificate", () => {
    expect(checkSigningSessions({ ...ok, sessions: { ...sessions, s2: { role: "officiant", certificateId: "C-9" } } })).toMatch(/different certificate/);
  });
  it("rejects a signature placed under the wrong role, and reused signatures", () => {
    expect(checkSigningSessions({ ...ok, signatures: { witness1: "s1", officiant: "s1" } })).toMatch(/two roles/);
    expect(checkSigningSessions({ ...ok, signatures: { witness1: "s2", officiant: "s1" } })).toMatch(/different role/);
  });
  it("rejects a primary session that isn't in the signature map", () => {
    expect(checkSigningSessions({ ...ok, primarySessionId: "s9" })).toMatch(/isn't part/);
  });
});
