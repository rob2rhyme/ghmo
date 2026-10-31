import { describe, expect, it } from "vitest";
import { countByCaller, householdKey, moveMember, planAssignments, spread, type Assignment, type TreeMember } from "@/src/lib/callingTree";

const member = (id: string, extra: Partial<TreeMember> = {}): TreeMember => ({ id, name: `Member ${id}`, eligible: true, ...extra });
const people = (n: number) => Array.from({ length: n }, (_, i) => member(String(i + 1).padStart(3, "0")));
const CALLERS = ["ann", "bob", "cal", "dee", "eve", "fay"];

describe("planAssignments", () => {
  it("splits members equally within one across the callers, in a fixed order", () => {
    const plan = planAssignments({ members: people(40), callers: CALLERS, existing: [] });
    expect(plan.assignments).toHaveLength(40);
    expect(spread(plan.counts)).toBeLessThanOrEqual(1);
    expect(Object.values(plan.counts).sort()).toEqual([6, 6, 7, 7, 7, 7]);
    // The first four callers in the list get the extra person.
    expect([plan.counts.ann, plan.counts.bob, plan.counts.cal, plan.counts.dee]).toEqual([7, 7, 7, 7]);
    expect(plan.changes.every(change => change.reason === "placed")).toBe(true);
  });

  it("is deterministic and stable: the same input plans nothing new, and a new member only adds", () => {
    const first = planAssignments({ members: people(13), callers: CALLERS, existing: [] });
    const again = planAssignments({ members: people(13), callers: CALLERS, existing: first.assignments });
    expect(again.assignments).toEqual(first.assignments);
    expect(again.changes).toEqual([]);

    const shuffled = [...people(13)].reverse();
    expect(planAssignments({ members: shuffled, callers: CALLERS, existing: [] }).assignments).toEqual(first.assignments);

    const grown = planAssignments({ members: [...people(13), member("new")], callers: CALLERS, existing: first.assignments });
    expect(grown.changes).toEqual([{ memberId: "new", from: null, to: expect.any(String), reason: "placed" }]);
    expect(grown.assignments.filter(a => a.memberId !== "new")).toEqual(first.assignments);
    // The newcomer goes to a caller who had the fewest.
    const before = countByCaller(first.assignments, CALLERS);
    const target = grown.changes[0].to!;
    expect(before[target]).toBe(Math.min(...Object.values(before)));
  });

  it("keeps a household with one caller, and new household members join that caller", () => {
    const members = [
      member("a1", { household: "Thapa family" }),
      member("a2", { household: " thapa  FAMILY " }),
      member("a3", { household: "Thapa family" }),
      ...people(9)
    ];
    const plan = planAssignments({ members, callers: ["x", "y", "z"], existing: [] });
    const caller = (id: string) => plan.assignments.find(a => a.memberId === id)!.callerUid;
    expect(new Set([caller("a1"), caller("a2"), caller("a3")]).size).toBe(1);
    expect(spread(plan.counts)).toBeLessThanOrEqual(1);

    const later = planAssignments({ members: [...members, member("a4", { household: "THAPA family" })], callers: ["x", "y", "z"], existing: plan.assignments });
    expect(later.changes).toEqual([{ memberId: "a4", from: null, to: caller("a1"), reason: "household" }]);
  });

  it("moves only the removed caller's members when a caller leaves", () => {
    const first = planAssignments({ members: people(30), callers: CALLERS, existing: [] });
    const fewer = CALLERS.filter(uid => uid !== "cal");
    const plan = planAssignments({ members: people(30), callers: fewer, existing: first.assignments });
    const movedIds = new Set(plan.changes.filter(c => c.reason === "caller_removed").map(c => c.memberId));
    const calsMembers = new Set(first.assignments.filter(a => a.callerUid === "cal").map(a => a.memberId));
    expect(movedIds).toEqual(calsMembers);
    expect(plan.changes.filter(c => c.reason === "placed").map(c => c.memberId).sort()).toEqual([...calsMembers].sort());
    for (const a of first.assignments) {
      if (!calsMembers.has(a.memberId)) expect(plan.assignments).toContainEqual(a);
    }
    expect(spread(plan.counts)).toBeLessThanOrEqual(1);
    expect(plan.assignments.some(a => a.callerUid === "cal")).toBe(false);
  });

  it("drops members who can no longer be called and never assigns ineligible ones", () => {
    const existing: Assignment[] = [
      { memberId: "001", callerUid: "ann" },
      { memberId: "gone", callerUid: "bob" }
    ];
    const members = [member("001"), member("002", { eligible: false })];
    const plan = planAssignments({ members, callers: ["ann", "bob"], existing });
    expect(plan.assignments).toEqual([{ memberId: "001", callerUid: "ann" }]);
    // "gone" is not on the member list at all, so it is dropped silently; 002 is reported.
    expect(plan.changes).toEqual([]);
    const withIneligible = planAssignments({ members, callers: ["ann", "bob"], existing: [...existing, { memberId: "002", callerUid: "ann" }] });
    expect(withIneligible.changes).toEqual([{ memberId: "002", from: "ann", to: null, reason: "ineligible" }]);
  });

  it("with no callers, everyone is unassigned", () => {
    const first = planAssignments({ members: people(4), callers: ["ann"], existing: [] });
    const plan = planAssignments({ members: people(4), callers: [], existing: first.assignments });
    expect(plan.assignments).toEqual([]);
    expect(plan.changes).toHaveLength(4);
    expect(plan.counts).toEqual({});
  });

  it("ignores a caller listed twice", () => {
    const plan = planAssignments({ members: people(4), callers: ["ann", "ann", "bob"], existing: [] });
    expect(plan.counts).toEqual({ ann: 2, bob: 2 });
  });
});

describe("helpers", () => {
  it("normalizes household keys", () => {
    expect(householdKey("  Thapa   Family ")).toBe("thapa family");
    expect(householdKey("")).toBeNull();
    expect(householdKey(undefined)).toBeNull();
  });

  it("moves one member by hand and counts per caller", () => {
    const moved = moveMember([{ memberId: "a", callerUid: "x" }, { memberId: "b", callerUid: "x" }], "b", "y");
    expect(moved).toEqual([{ memberId: "a", callerUid: "x" }, { memberId: "b", callerUid: "y" }]);
    expect(countByCaller(moved, ["x", "y", "z"])).toEqual({ x: 1, y: 1, z: 0 });
    expect(spread({ x: 1, y: 1, z: 0 })).toBe(1);
    expect(spread({})).toBe(0);
  });
});
