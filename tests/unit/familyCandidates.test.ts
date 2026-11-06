import { describe, expect, it } from "vitest";
import { familyCandidateLabel, familyCandidates } from "@/src/lib/familyCandidates";

const members = [
  { id: "m1", name: "Asha Rai", emailLower: "asha@example.org" },
  { id: "m2", name: "Bina Rai", emailLower: "bina@example.org" },
  { id: "m3", name: null, emailLower: "dil@example.org" }
];

describe("familyCandidates", () => {
  it("offers relatives who aren't members, once each, sorted by name", () => {
    const families = new Map([
      ["m1", [{ name: "Ram Rai", relationship: "Husband", phone: "+17175550101" }, { name: "Bina Rai", relationship: "Sister" }, { name: "  " }]],
      ["m2", [{ name: "ram rai", relationship: "Brother-in-law", phone: "+17175550101" }, { name: "Gita Rai", relationship: "Mother" }]],
      ["m3", [{ name: "Dilip Gurung" }]]
    ]);
    const out = familyCandidates(members, families);
    expect(out.map(c => c.name)).toEqual(["Dilip Gurung", "Gita Rai", "Ram Rai"]);
    expect(out.find(c => c.name === "Ram Rai")).toEqual({ key: "m1:0", name: "Ram Rai", relationship: "Husband", phone: "+17175550101", ofMemberId: "m1", ofMemberName: "Asha Rai" });
    expect(out.find(c => c.name === "Dilip Gurung")).toMatchObject({ ofMemberName: "dil@example.org" });
    expect(out.find(c => c.name === "Dilip Gurung")).not.toHaveProperty("phone");
  });

  it("is empty when nothing is decrypted", () => {
    expect(familyCandidates(members, new Map())).toEqual([]);
  });

  it("labels a relative by relationship, or as family", () => {
    expect(familyCandidateLabel({ name: "Ram Rai", relationship: "Husband", ofMemberName: "Asha Rai" })).toBe("Ram Rai (husband of Asha Rai)");
    expect(familyCandidateLabel({ name: "Dilip", ofMemberName: "Dil" })).toBe("Dilip (family of Dil)");
  });
});
