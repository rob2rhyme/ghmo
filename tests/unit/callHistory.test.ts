import { describe, expect, it } from "vitest";
import { MANNERS, MANNER_LABELS, attemptMannerLoc, attemptNoteLoc, isManner } from "@/src/lib/callCampaigns";
import { mannerCounts, mannerSummaryLine, sortHistoryNewestFirst, summarizeHistory, type HistoryEntry } from "@/src/lib/callHistory";

const entry = (id: string, createdAt: number | null, outcome: HistoryEntry["call"]["outcome"], attempts: number): HistoryEntry => ({
  campaign: { id, title: `Campaign ${id}`, eventTitle: null, createdAt, status: "closed" },
  call: { callerUid: "alice", outcome, rsvp: null, attempts: Array.from({ length: attempts }, (_, i) => ({ id: `${id}-a${i}`, at: 1000 + i, outcome: "no_answer" as const, byUid: "alice" })) }
});

describe("manner", () => {
  it("has three fixed levels with plain labels", () => {
    expect(MANNERS).toEqual(["polite", "neutral", "rude"]);
    expect(MANNER_LABELS).toEqual({ polite: "Polite", neutral: "Neutral", rude: "Rude" });
    expect(isManner("rude")).toBe(true);
    expect(isManner("angry")).toBe(false);
    expect(isManner(null)).toBe(false);
  });

  it("binds a rating to its own attempt, separately from the note", () => {
    expect(attemptMannerLoc("c1", "m1", "a1")).toEqual({ path: "organizations/ghmo/callCampaigns", docId: "c1/m1#a1:manner" });
    expect(attemptMannerLoc("c1", "m1", "a1")).not.toEqual(attemptNoteLoc("c1", "m1", "a1"));
    expect(attemptMannerLoc("c1", "m1", "a1")).not.toEqual(attemptMannerLoc("c1", "m1", "a2"));
    expect(attemptMannerLoc("c1", "m1", "a1")).not.toEqual(attemptMannerLoc("c1", "m2", "a1"));
  });

  it("counts each level and ignores anything else", () => {
    expect(mannerCounts(["polite", "polite", "rude", "neutral", null, undefined, "angry", 7])).toEqual({ polite: 2, neutral: 1, rude: 1, total: 4 });
    expect(mannerCounts([])).toEqual({ polite: 0, neutral: 0, rude: 0, total: 0 });
  });

  it("words the summary plainly", () => {
    expect(mannerSummaryLine(mannerCounts(["polite", "polite", "polite", "neutral", "rude"]))).toBe("3 polite · 1 neutral · 1 rude");
    expect(mannerSummaryLine(mannerCounts(["polite"]))).toBe("1 polite");
    expect(mannerSummaryLine(mannerCounts([]))).toBe("No ratings yet");
  });
});

describe("history", () => {
  it("lists the newest campaign first and undated ones last", () => {
    const sorted = sortHistoryNewestFirst([entry("b", 100, "reached", 1), entry("z", null, null, 0), entry("a", 300, "no_answer", 2)]);
    expect(sorted.map(e => e.campaign.id)).toEqual(["a", "b", "z"]);
  });

  it("totals campaigns, attempts and times reached", () => {
    expect(summarizeHistory([entry("a", 1, "reached", 2), entry("b", 2, "voicemail", 3), entry("c", 3, "reached", 1)])).toEqual({ campaigns: 3, attempts: 6, reached: 2 });
    expect(summarizeHistory([])).toEqual({ campaigns: 0, attempts: 0, reached: 0 });
  });
});
