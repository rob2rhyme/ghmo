import { describe, expect, it } from "vitest";
import { planEmailChange, type EmailChangeInput } from "@/src/lib/memberEmailChange";

const now = new Date("2026-11-06T12:00:00Z");
const asha = { email: "Asha@Example.org", emailLower: "asha@example.org", name: "Asha Rai", hasPhone: false };
const plan = (over: Partial<EmailChangeInput>) => planEmailChange({ before: asha, newEmail: "asha.rai@example.org", duplicateOf: null, suppression: null, now, ...over });

describe("planEmailChange", () => {
  it("changes the address, resets the sign-in link and clears an old bounce", () => {
    const result = plan({ before: { ...asha, emailBounced: true } });
    expect(result).toEqual({
      ok: true,
      kind: "changed",
      emailLower: "asha.rai@example.org",
      keepOld: { emailLower: "asha@example.org", reason: "bounced" },
      updates: { email: "asha.rai@example.org", emailLower: "asha.rai@example.org", uid: null, emailBounced: false, updatedAt: now }
    });
  });

  it("keeps the case the admin typed but compares without it", () => {
    const result = plan({ newEmail: "  Asha.Rai@Example.org " });
    expect(result.ok && result.updates.email).toBe("Asha.Rai@Example.org");
    expect(result.ok && result.emailLower).toBe("asha.rai@example.org");
  });

  it("refuses the same address, and only fixes the case when that is all that changed", () => {
    expect(plan({ newEmail: "Asha@Example.org" })).toMatchObject({ ok: false, status: 400 });
    const caseOnly = plan({ newEmail: "asha@example.org" });
    expect(caseOnly).toEqual({ ok: true, kind: "changed", emailLower: "asha@example.org", keepOld: null, updates: { email: "asha@example.org", updatedAt: now } });
  });

  it("refuses an address another member uses", () => {
    expect(plan({ duplicateOf: { id: "b", name: "Bina Thapa" } })).toEqual({ ok: false, status: 409, error: "Bina Thapa already uses this address. One address can belong to only one member." });
  });

  it("keeps consent and an opt-out with the person, and puts an opted-out old address on the do-not-email list", () => {
    const optedOut = new Date("2026-01-01");
    const result = plan({ before: { ...asha, emailOptOutAt: optedOut } });
    expect(result.ok && result.updates).not.toHaveProperty("emailOptOutAt");
    expect(result.ok && result.keepOld).toEqual({ emailLower: "asha@example.org", reason: "opted_out" });
    expect(plan({}).ok && (plan({}) as { keepOld: unknown }).keepOld).toBeNull();
  });

  it("applies the new address's do-not-email record at once", () => {
    const at = new Date("2025-05-05");
    expect(plan({ suppression: { reason: "opted_out", at } })).toMatchObject({ ok: true, updates: { emailOptOutAt: at, emailBounced: false } });
    expect(plan({ suppression: { reason: "bounced", at } })).toMatchObject({ ok: true, updates: { emailBounced: true } });
    // An existing opt-out keeps its own, earlier time.
    const own = new Date("2024-01-01");
    const kept = plan({ before: { ...asha, emailOptOutAt: own }, suppression: { reason: "opted_out", at } });
    expect(kept.ok && kept.updates).not.toHaveProperty("emailOptOutAt");
  });

  it("adds an address to a phone-only member", () => {
    const result = plan({ before: { emailLower: "", name: "Deepak", hasPhone: true }, newEmail: "deepak@example.org" });
    expect(result).toMatchObject({ ok: true, kind: "added", keepOld: null, updates: { email: "deepak@example.org", emailLower: "deepak@example.org", uid: null } });
  });

  it("removes an address only when a name and a phone number remain", () => {
    expect(plan({ newEmail: "" })).toMatchObject({ ok: false, status: 400 });
    expect(plan({ newEmail: "", before: { ...asha, hasPhone: true, name: " " } })).toMatchObject({ ok: false, status: 400 });
    expect(plan({ newEmail: "", before: { emailLower: "", name: "D", hasPhone: true } })).toEqual({ ok: false, status: 400, error: "This member has no email address to remove." });
    const removed = plan({ newEmail: " ", before: { ...asha, hasPhone: true, emailOptOutAt: new Date("2026-02-02") } });
    expect(removed).toMatchObject({ ok: true, kind: "removed", emailLower: "", keepOld: { emailLower: "asha@example.org", reason: "opted_out" }, updates: { email: null, emailLower: "", uid: null } });
  });
});
