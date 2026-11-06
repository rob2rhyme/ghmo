import { describe, expect, it } from "vitest";
import { matchRecords, normalizeForSearch, scoreEntry, searchHref, seeAllHref, type SearchEntry } from "@/src/lib/adminSearch";

const index: SearchEntry[] = [
  { kind: "member", id: "m1", title: "Asha Rai", detail: "asha@example.org" },
  { kind: "member", id: "m2", title: "Bina Thapa", detail: "bina.thapa@example.org", badge: "Turned off" },
  { kind: "member", id: "m3", title: "Rajesh Ashan", detail: "" },
  { kind: "event", id: "e1", title: "Summer picnic", detail: "Jul 4, 2026", sortMs: 2 },
  { kind: "event", id: "e2", title: "Winter picnic", detail: "Jan 1, 2026", sortMs: 1 },
  { kind: "minutes", id: "n1", title: "Picnic planning call", detail: "Draft" },
  { kind: "group", id: "g1", title: "Cooking team" },
  { kind: "position", id: "treasurer", title: "Treasurer", detail: "Asha Rai" },
  { kind: "broadcast", id: "b1", title: "Śrī Panchami invitation", detail: "Sent" }
];

describe("normalizeForSearch", () => {
  it("ignores capitals, accents and punctuation, and keeps email characters", () => {
    expect(normalizeForSearch("  Śrī   PANCHAMI, 2026! ")).toBe("sri panchami 2026");
    expect(normalizeForSearch("Bina.Thapa@Example.org")).toBe("bina.thapa@example.org");
    expect(normalizeForSearch("गुरुङ")).not.toBe("");
  });
});

describe("matchRecords", () => {
  it("needs two letters, and every word must match", () => {
    expect(matchRecords(index, "a")).toEqual([]);
    expect(matchRecords(index, "asha rai").flatMap(g => g.entries.map(e => e.id))).toEqual(["m1", "treasurer"]);
    expect(matchRecords(index, "asha nobody")).toEqual([]);
  });

  it("groups by kind in a fixed order, and ranks names that start with the words first", () => {
    const groups = matchRecords(index, "ash");
    expect(groups.map(g => g.kind)).toEqual(["member", "position"]);
    expect(groups[0].entries.map(e => e.id)).toEqual(["m1", "m3"]);
  });

  it("finds by email, accent-free text and the second line", () => {
    expect(matchRecords(index, "thapa@")[0].entries[0].id).toBe("m2");
    expect(matchRecords(index, "sri panchami")[0].kind).toBe("broadcast");
    expect(matchRecords(index, "treasurer")[0].entries[0].id).toBe("treasurer");
  });

  it("keeps newer first on a tie, caps each kind and counts the rest", () => {
    const groups = matchRecords(index, "picnic", 1);
    expect(groups.map(g => [g.kind, g.entries.map(e => e.id), g.total])).toEqual([
      ["event", ["e1"], 2],
      ["minutes", ["n1"], 1]
    ]);
  });

  it("scores word starts above the middle of a word", () => {
    expect(scoreEntry({ title: "Cooking team" }, ["team"])).toBeLessThan(scoreEntry({ title: "Steamboat" }, ["team"])!);
    expect(scoreEntry({ title: "X", detail: "team" }, ["team"])).toBeGreaterThan(scoreEntry({ title: "Steamboat" }, ["team"])!);
  });
});

describe("links", () => {
  it("opens each kind where it is acted on", () => {
    expect(searchHref({ kind: "member", id: "m 1" })).toBe("/admin/members/m%201");
    expect(searchHref({ kind: "event", id: "e1" })).toBe("/admin/events/e1/edit");
    expect(searchHref({ kind: "minutes", id: "n1" })).toBe("/admin/minutes?mode=new&minutesId=n1");
    expect(searchHref({ kind: "group", id: "g1" })).toBe("/admin/groups/g1");
    expect(searchHref({ kind: "position", id: "treasurer" })).toBe("/admin/positions");
    expect(searchHref({ kind: "broadcast", id: "b1" })).toBe("/admin/broadcasts/b1");
    expect(seeAllHref("member", " asha rai ")).toBe("/admin/members?q=asha%20rai");
    expect(seeAllHref("minutes", "picnic")).toBe("/admin/minutes?mode=records&q=picnic");
    expect(seeAllHref("event", "picnic")).toBeNull();
  });
});
