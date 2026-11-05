import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSITIONS,
  addDays,
  currentPositionIdsByMember,
  isValidDate,
  monthYear,
  planTerm,
  rangesOverlap,
  sortPositions,
  sortTermsNewestFirst,
  termEditConflict,
  termStatus,
  todayIn,
  type Term
} from "@/src/lib/positions";

const term = (over: Partial<Term> & Pick<Term, "id" | "memberId">): Term => ({
  positionId: "president",
  startsOn: "2024-01-01",
  endsOn: null,
  note: "",
  ...over
});
const president = { title: "President", multiple: false };
const board = { title: "Board Member", multiple: true };

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isValidDate("2026-11-05")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-5")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate(20260101)).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reads today in the organisation's time zone, not UTC", () => {
    // 02:30 UTC on 5 Nov is still the evening of 4 Nov in Harrisburg.
    expect(todayIn(new Date("2026-11-05T02:30:00Z"))).toBe("2026-11-04");
    expect(todayIn(new Date("2026-11-05T14:00:00Z"))).toBe("2026-11-05");
    expect(todayIn(new Date("2026-11-05T02:30:00Z"), "Asia/Kathmandu")).toBe("2026-11-05");
  });

  it("formats a month for 'since Mar 2025'", () => {
    expect(monthYear("2025-03-18")).toBe("Mar 2025");
  });
});

describe("term status and overlap", () => {
  it("tells upcoming, current and past apart, including the boundary days", () => {
    const t = { startsOn: "2025-01-10", endsOn: "2025-06-30" };
    expect(termStatus(t, "2025-01-09")).toBe("upcoming");
    expect(termStatus(t, "2025-01-10")).toBe("current");
    expect(termStatus(t, "2025-06-30")).toBe("current");
    expect(termStatus(t, "2025-07-01")).toBe("past");
    expect(termStatus({ startsOn: "2025-01-10", endsOn: null }, "2030-01-01")).toBe("current");
  });

  it("overlaps when ranges share a day, and an open end runs forever", () => {
    expect(rangesOverlap({ startsOn: "2025-01-01", endsOn: "2025-01-31" }, { startsOn: "2025-01-31", endsOn: null })).toBe(true);
    expect(rangesOverlap({ startsOn: "2025-01-01", endsOn: "2025-01-30" }, { startsOn: "2025-01-31", endsOn: null })).toBe(false);
    expect(rangesOverlap({ startsOn: "2025-01-01", endsOn: null }, { startsOn: "2030-01-01", endsOn: null })).toBe(true);
  });
});

describe("planTerm", () => {
  it("accepts a first holder with no end date", () => {
    expect(planTerm({ terms: [], position: president, memberId: "m1", startsOn: "2026-01-01", endsOn: null, endPrevious: false })).toEqual({ ok: true, closes: [] });
  });

  it("refuses unreal dates and an end before the start", () => {
    const base = { terms: [], position: president, memberId: "m1", endPrevious: false };
    expect(planTerm({ ...base, startsOn: "", endsOn: null })).toMatchObject({ ok: false });
    expect(planTerm({ ...base, startsOn: "2026-02-30", endsOn: null })).toMatchObject({ ok: false });
    expect(planTerm({ ...base, startsOn: "2026-05-01", endsOn: "nope" })).toMatchObject({ ok: false });
    expect(planTerm({ ...base, startsOn: "2026-05-01", endsOn: "2026-04-30" })).toMatchObject({ ok: false, error: "The end date is before the start date." });
  });

  it("refuses a second term for the same person over the same dates", () => {
    const plan = planTerm({ terms: [term({ id: "t1", memberId: "m1" })], position: president, memberId: "m1", startsOn: "2026-01-01", endsOn: null, endPrevious: true });
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { error: string }).error).toContain("already hold President");
  });

  it("lets the same person return after their term ended", () => {
    const old = term({ id: "t1", memberId: "m1", startsOn: "2020-01-01", endsOn: "2021-12-31" });
    expect(planTerm({ terms: [old], position: president, memberId: "m1", startsOn: "2024-01-01", endsOn: null, endPrevious: false })).toEqual({ ok: true, closes: [] });
  });

  it("asks to end a single-seat holder first, and ends them the day before when told to", () => {
    const current = term({ id: "t1", memberId: "m1", startsOn: "2024-01-01" });
    const plain = planTerm({ terms: [current], position: president, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: false });
    expect(plain).toMatchObject({ ok: false });
    expect((plain as { error: string }).error).toContain("End their term");
    expect(planTerm({ terms: [current], position: president, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: true })).toEqual({
      ok: true,
      closes: [{ termId: "t1", endsOn: "2026-02-28" }]
    });
  });

  it("allows several holders when the position allows it", () => {
    const current = term({ id: "t1", memberId: "m1", positionId: "board_member" });
    expect(planTerm({ terms: [current], position: board, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: false })).toEqual({ ok: true, closes: [] });
  });

  it("refuses to end someone before they began", () => {
    const later = term({ id: "t1", memberId: "m1", startsOn: "2026-06-01" });
    const plan = planTerm({ terms: [later], position: president, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: true });
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { error: string }).error).toContain("starts on or after");
  });

  it("closes every overlapping holder, not just one", () => {
    const a = term({ id: "a", memberId: "m1", positionId: "board_member", startsOn: "2023-01-01" });
    const b = term({ id: "b", memberId: "m3", positionId: "board_member", startsOn: "2024-01-01" });
    const plan = planTerm({ terms: [a, b], position: board, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: true });
    expect(plan).toEqual({
      ok: true,
      closes: [
        { termId: "a", endsOn: "2026-02-28" },
        { termId: "b", endsOn: "2026-02-28" }
      ]
    });
  });

  it("ignores holders whose terms already ended", () => {
    const past = term({ id: "t1", memberId: "m1", startsOn: "2020-01-01", endsOn: "2023-12-31" });
    expect(planTerm({ terms: [past], position: president, memberId: "m2", startsOn: "2026-03-01", endsOn: null, endPrevious: false })).toEqual({ ok: true, closes: [] });
  });
});

describe("editing a term", () => {
  const terms = [term({ id: "t1", memberId: "m1", startsOn: "2020-01-01", endsOn: "2021-12-31" }), term({ id: "t2", memberId: "m1", startsOn: "2024-01-01" })];
  it("allows changing a term without clashing with itself", () => {
    expect(termEditConflict({ terms, termId: "t2", memberId: "m1", startsOn: "2024-02-01", endsOn: null })).toBeNull();
  });
  it("refuses a change that runs into the person's other term, or ends before it starts", () => {
    expect(termEditConflict({ terms, termId: "t2", memberId: "m1", startsOn: "2021-06-01", endsOn: null })).toContain("already hold");
    expect(termEditConflict({ terms, termId: "t2", memberId: "m1", startsOn: "2024-05-01", endsOn: "2024-04-01" })).toContain("before the start");
  });
});

describe("views", () => {
  it("lists the positions each member holds today", () => {
    const terms = [
      term({ id: "t1", memberId: "m1", positionId: "president" }),
      term({ id: "t2", memberId: "m1", positionId: "board_member" }),
      term({ id: "t3", memberId: "m2", positionId: "treasurer", endsOn: "2025-12-31" }),
      term({ id: "t4", memberId: "m3", positionId: "secretary", startsOn: "2027-01-01" })
    ];
    expect(currentPositionIdsByMember(terms, "2026-11-05")).toEqual({ m1: ["president", "board_member"] });
  });

  it("sorts positions by list order, then title, and terms newest first", () => {
    expect(sortPositions([{ order: 2, title: "B" }, { order: 1, title: "Z" }, { order: 1, title: "A" }]).map(p => p.title)).toEqual(["A", "Z", "B"]);
    const sorted = sortTermsNewestFirst([
      { startsOn: "2020-01-01", endsOn: "2021-01-01" },
      { startsOn: "2024-01-01", endsOn: null },
      { startsOn: "2022-01-01", endsOn: "2023-01-01" }
    ]);
    expect(sorted.map(t => t.startsOn)).toEqual(["2024-01-01", "2022-01-01", "2020-01-01"]);
  });

  it("seeds sixteen standing positions with unique ids and both languages", () => {
    expect(DEFAULT_POSITIONS).toHaveLength(16);
    expect(new Set(DEFAULT_POSITIONS.map(p => p.id)).size).toBe(16);
    expect(DEFAULT_POSITIONS.every(p => p.title && p.titleNe)).toBe(true);
    expect(DEFAULT_POSITIONS.find(p => p.id === "president")).toMatchObject({ title: "President", titleNe: "अध्यक्ष", multiple: false });
    expect(DEFAULT_POSITIONS.filter(p => p.multiple).map(p => p.id)).toEqual(["advisor", "executive_member", "board_member"]);
  });
});
