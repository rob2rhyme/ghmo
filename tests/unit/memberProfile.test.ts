import { describe, expect, it } from "vitest";
import {
  MAX_FAMILY,
  checkMemberSince,
  cleanCity,
  contactIsEmpty,
  lengthLabel,
  locationLabel,
  memberSinceLine,
  membershipLength,
  normalizeFamily,
  normalizeState,
  withFamily
} from "@/src/lib/memberProfile";

describe("city and state", () => {
  it("cleans a city and keeps it as typed", () => {
    expect(cleanCity("  Harrisburg   ")).toBe("Harrisburg");
    expect(cleanCity("New\n  York")).toBe("New York");
    expect(cleanCity(5)).toBe("");
    expect(cleanCity("x".repeat(200))).toHaveLength(80);
  });

  it("turns US state names and codes into the two-letter code, and keeps other places as typed", () => {
    expect(normalizeState("pa")).toBe("PA");
    expect(normalizeState("Pennsylvania")).toBe("PA");
    expect(normalizeState(" new  york ")).toBe("NY");
    expect(normalizeState("D.C.")).toBe("DC");
    expect(normalizeState("Bagmati Province")).toBe("Bagmati Province");
    expect(normalizeState("")).toBe("");
    expect(normalizeState(null)).toBe("");
  });

  it("joins whichever parts are known", () => {
    expect(locationLabel("Harrisburg", "PA")).toBe("Harrisburg, PA");
    expect(locationLabel("Harrisburg", "")).toBe("Harrisburg");
    expect(locationLabel("", "PA")).toBe("PA");
    expect(locationLabel(null, undefined)).toBe("");
  });
});

describe("member since", () => {
  const today = "2026-11-05";
  it("accepts a real past date and refuses the rest", () => {
    expect(checkMemberSince("2019-03-18", today)).toBeNull();
    expect(checkMemberSince("2026-11-05", today)).toBeNull();
    expect(checkMemberSince("2026-11-06", today)).toContain("future");
    expect(checkMemberSince("1019-01-01", today)).toContain("too early");
    expect(checkMemberSince("2019-02-30", today)).toContain("real date");
    expect(checkMemberSince("", today)).toContain("real date");
    expect(checkMemberSince(2019, today)).toContain("real date");
  });

  it("counts whole years and months, and a month only once its day is reached", () => {
    expect(membershipLength("2019-03-18", "2026-11-05")).toEqual({ years: 7, months: 7, totalMonths: 91 });
    expect(membershipLength("2019-03-18", "2026-11-18")).toEqual({ years: 7, months: 8, totalMonths: 92 });
    expect(membershipLength("2026-11-05", "2026-11-05")).toEqual({ years: 0, months: 0, totalMonths: 0 });
    expect(membershipLength("2025-11-05", "2026-11-05")).toEqual({ years: 1, months: 0, totalMonths: 12 });
    expect(membershipLength("2026-12-01", "2026-11-05").totalMonths).toBe(0);
  });

  it("words the length plainly", () => {
    expect(lengthLabel(membershipLength("2019-03-18", "2026-11-18"))).toBe("7 years, 8 months");
    expect(lengthLabel(membershipLength("2025-11-05", "2026-11-05"))).toBe("1 year");
    expect(lengthLabel(membershipLength("2026-08-05", "2026-11-05"))).toBe("3 months");
    expect(lengthLabel(membershipLength("2026-10-20", "2026-11-05"))).toBe("less than a month");
    expect(memberSinceLine("2019-03-18", "2026-11-18")).toBe("Member since Mar 2019 · 7 years, 8 months");
  });
});

describe("family", () => {
  it("cleans the list: blank rows dropped, numbers stored as E.164, relationship and number optional", () => {
    const result = normalizeFamily([
      { name: "  Sita   Puwart ", relationship: " spouse ", phone: "717-555-0101" },
      { name: "Ram", relationship: "", phone: "" },
      { name: "", relationship: "", phone: "" },
      null
    ]);
    expect(result).toEqual({
      ok: true,
      family: [{ name: "Sita Puwart", relationship: "spouse", phone: "+17175550101" }, { name: "Ram" }]
    });
  });

  it("refuses a row with no name, a number that isn't one, and too many people", () => {
    expect(normalizeFamily([{ name: "", relationship: "son" }])).toEqual({ ok: false, error: "Give each family member a name." });
    expect(normalizeFamily([{ name: "Hari", phone: "12345" }])).toMatchObject({ ok: false, error: expect.stringContaining("The number for Hari") });
    expect(normalizeFamily(Array.from({ length: MAX_FAMILY + 1 }, (_, i) => ({ name: `P${i}` })))).toMatchObject({ ok: false });
    expect(normalizeFamily("nope")).toEqual({ ok: true, family: [] });
  });

  it("sets or removes the family list on a contact without touching the rest", () => {
    const contact = { phone: "+17175550100", language: "Nepali", family: [{ name: "Old" }] };
    expect(withFamily(contact, [{ name: "New", phone: "+17175550102" }])).toEqual({ phone: "+17175550100", language: "Nepali", family: [{ name: "New", phone: "+17175550102" }] });
    expect(withFamily(contact, [])).toEqual({ phone: "+17175550100", language: "Nepali" });
    expect(withFamily(contact, undefined)).toEqual({ phone: "+17175550100", language: "Nepali" });
  });

  it("counts a contact with only a family list as not empty", () => {
    expect(contactIsEmpty({})).toBe(true);
    expect(contactIsEmpty({ family: [] })).toBe(true);
    expect(contactIsEmpty({ family: [{ name: "Sita" }] })).toBe(false);
    expect(contactIsEmpty({ language: "Nepali" })).toBe(false);
  });
});
