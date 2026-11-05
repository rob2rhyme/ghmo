import { describe, expect, it } from "vitest";
import {
  MAX_GROUPS_PER_MEMBER,
  cleanGroupDescription,
  cleanGroupName,
  groupNameKey,
  groupNamesFor,
  linkMemberToAdmin,
  planMembership,
  suggestCallers
} from "@/src/lib/groups";

const admins = [
  { id: "uid-alice", authUid: "auth-alice", emailLower: "alice@example.org", status: "active" },
  { id: "uid-bob", emailLower: "bob@example.org", status: "active" },
  { id: "uid-gone", emailLower: "gone@example.org", status: "disabled" }
];

describe("linkMemberToAdmin", () => {
  it("matches by sign-in id first, even when the emails differ", () => {
    expect(linkMemberToAdmin({ uid: "uid-bob", emailLower: "someone-else@example.org" }, admins)?.id).toBe("uid-bob");
    expect(linkMemberToAdmin({ uid: "auth-alice", emailLower: "" }, admins)?.id).toBe("uid-alice");
  });

  it("falls back to the email, ignoring case and spaces", () => {
    expect(linkMemberToAdmin({ uid: null, emailLower: " Alice@Example.org ".toLowerCase() }, admins)?.id).toBe("uid-alice");
    expect(linkMemberToAdmin({ emailLower: "bob@example.org" }, admins)?.id).toBe("uid-bob");
  });

  it("never links a disabled admin, an unknown email, or a member without an email", () => {
    expect(linkMemberToAdmin({ emailLower: "gone@example.org" }, admins)).toBeNull();
    expect(linkMemberToAdmin({ uid: "uid-gone" }, admins)).toBeNull();
    expect(linkMemberToAdmin({ emailLower: "nobody@example.org" }, admins)).toBeNull();
    expect(linkMemberToAdmin({ emailLower: "" }, admins)).toBeNull();
    expect(linkMemberToAdmin({}, admins)).toBeNull();
  });
});

describe("planMembership", () => {
  const members = new Map<string, string[]>([
    ["a", []],
    ["b", ["cooking"]],
    ["c", ["cooking", "marketing"]]
  ]);
  const base = { groupId: "cooking", leadMemberId: "c", members };

  it("adds the people who are not in yet and skips those who are", () => {
    expect(planMembership({ ...base, add: ["a", "b"], remove: [] })).toEqual({ ok: true, added: ["a"], removed: [] });
  });

  it("removes only people who are in, and ignores duplicates in the request", () => {
    expect(planMembership({ ...base, add: [], remove: ["b", "b", "a"] })).toEqual({ ok: true, added: [], removed: ["b"] });
  });

  it("refuses removing the lead, adding unknown people, and an id in both lists", () => {
    expect(planMembership({ ...base, add: [], remove: ["c"] })).toMatchObject({ ok: false, status: 409 });
    expect(planMembership({ ...base, add: ["zzz"], remove: [] })).toMatchObject({ ok: false, status: 404 });
    expect(planMembership({ ...base, add: ["a"], remove: ["a"] })).toMatchObject({ ok: false, status: 400 });
    expect(planMembership({ ...base, add: [], remove: [] })).toMatchObject({ ok: false, status: 400 });
  });

  it("stops someone from joining more than the allowed number of groups", () => {
    const full = new Map<string, string[]>([["a", Array.from({ length: MAX_GROUPS_PER_MEMBER }, (_, i) => `g${i}`)]]);
    expect(planMembership({ groupId: "cooking", leadMemberId: null, members: full, add: ["a"], remove: [] })).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a change that is too large", () => {
    const many = Array.from({ length: 201 }, (_, i) => `m${i}`);
    expect(planMembership({ groupId: "cooking", leadMemberId: null, members: new Map(many.map(id => [id, []])), add: many, remove: [] })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("names", () => {
  it("cleans names and descriptions", () => {
    expect(cleanGroupName("  Cooking   team \n")).toBe("Cooking team");
    expect(cleanGroupName(42)).toBe("");
    expect(cleanGroupName("x".repeat(200))).toHaveLength(80);
    expect(cleanGroupDescription("  Line one\r\nline two  ")).toBe("Line one\nline two");
    expect(cleanGroupDescription("y".repeat(900))).toHaveLength(400);
  });

  it("compares group names without case or extra spaces", () => {
    expect(groupNameKey("Cooking   TEAM")).toBe(groupNameKey("cooking team"));
  });

  it("lists a member's group names in the order given and skips deleted groups", () => {
    const groups = [
      { id: "cooking", name: "Cooking team" },
      { id: "marketing", name: "Marketing" }
    ];
    expect(groupNamesFor(["marketing", "gone", "cooking"], groups)).toEqual(["Marketing", "Cooking team"]);
    expect(groupNamesFor(undefined, groups)).toEqual([]);
  });
});

describe("suggestCallers", () => {
  const link = (memberId: string, name: string, adminId: string | null, status = "active") => ({ memberId, name, status, adminId });

  it("suggests members who are admins and flags those who are not", () => {
    const result = suggestCallers([link("m1", "Asha Rai", "alice"), link("m2", "Zed", null), link("m3", "Bina Thapa", null), link("m4", "Carol", "carol")]);
    expect(result.suggestedAdminIds).toEqual(["alice", "carol"]);
    expect(result.needsAdminAccess).toEqual([
      { memberId: "m3", name: "Bina Thapa" },
      { memberId: "m2", name: "Zed" }
    ]);
  });

  it("suggests an admin once even if two members link to them, and ignores disabled members", () => {
    const result = suggestCallers([link("m1", "A", "alice"), link("m2", "A again", "alice"), link("m3", "Gone", "bob", "disabled"), link("m4", "Left", null, "disabled")]);
    expect(result).toEqual({ suggestedAdminIds: ["alice"], needsAdminAccess: [] });
  });

  it("says nothing for an empty group", () => {
    expect(suggestCallers([])).toEqual({ suggestedAdminIds: [], needsAdminAccess: [] });
  });
});
