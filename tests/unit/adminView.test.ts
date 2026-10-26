import { describe, expect, it } from "vitest";
import {
  auditTitle,
  firstName,
  formatMoney,
  formatShortDate,
  humanizeAction,
  initialsOf,
  percentOf,
  relativeTime,
  roleLabel
} from "@/src/lib/adminView";

describe("people", () => {
  it("takes the first name, with a friendly fallback", () => {
    expect(firstName("Robin Thapa")).toBe("Robin");
    expect(firstName("  Sita  ")).toBe("Sita");
    expect(firstName("")).toBe("there");
    expect(firstName(undefined)).toBe("there");
  });

  it("makes initials from the first and last word", () => {
    expect(initialsOf("Robin Thapa")).toBe("RT");
    expect(initialsOf("anita maya gurung")).toBe("AG");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("")).toBe("A");
    expect(initialsOf(null)).toBe("A");
  });

  it("labels super admins and everyone else", () => {
    expect(roleLabel(["admin", "super_admin"])).toBe("Super admin");
    expect(roleLabel(["admin"])).toBe("Admin");
    expect(roleLabel(undefined)).toBe("Admin");
  });
});

describe("audit titles", () => {
  it("turns action names into readable text", () => {
    expect(humanizeAction("passkey_registered")).toBe("Passkey registered");
    expect(humanizeAction("totp-login-failed")).toBe("Totp login failed");
    expect(humanizeAction("")).toBe("");
  });

  it("prefers a summary, then the resource summary, then the action", () => {
    expect(auditTitle({ summary: "Approved minutes", action: "x" })).toBe("Approved minutes");
    expect(auditTitle({ resource: { summary: "Authenticator app" }, action: "login" })).toBe("Authenticator app");
    expect(auditTitle({ action: "passkey_registered" })).toBe("Passkey registered");
    expect(auditTitle({ type: "event_created" })).toBe("Event created");
    expect(auditTitle({})).toBe("Activity");
  });
});

describe("relative time", () => {
  const now = Date.UTC(2026, 9, 26, 12, 0, 0);
  it("reads naturally at each scale", () => {
    expect(relativeTime(now - 20_000, now)).toBe("just now");
    expect(relativeTime(now + 5_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });

  it("switches to a date after a week, and is empty without a time", () => {
    expect(relativeTime(Date.UTC(2026, 8, 1, 12), now)).toMatch(/Sep 1, 2026/);
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime(Number.NaN, now)).toBe("");
  });
});

describe("numbers and dates", () => {
  it("computes progress toward a goal, clamped", () => {
    expect(percentOf(48250, 75000)).toBe(64);
    expect(percentOf(100000, 75000)).toBe(100);
    expect(percentOf(undefined, 75000)).toBe(0);
    expect(percentOf(10, 0)).toBeNull();
    expect(percentOf(10, undefined)).toBeNull();
  });

  it("formats money and dates the same on server and browser", () => {
    expect(formatMoney(48250)).toBe("$48,250");
    expect(formatMoney(undefined)).toBe("$0");
    expect(formatShortDate(Date.UTC(2026, 9, 23, 12))).toBe("Oct 23, 2026");
    expect(formatShortDate(null)).toBe("Date unavailable");
  });
});
