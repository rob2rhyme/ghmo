import { describe, expect, it } from "vitest";
import {
  attemptNoteLoc,
  campaignCsv,
  campaignScriptLoc,
  computeCounts,
  isFinalOutcome,
  normalizeTitle,
  planAttempt,
  progressByCaller,
  type CallRow
} from "@/src/lib/callCampaigns";

const row = (over: Partial<CallRow> = {}): CallRow => ({ memberId: "m1", callerUid: "bob", outcome: null, rsvp: null, attemptCount: 0, ...over });

describe("planAttempt", () => {
  it("records the latest outcome, counts the attempt and keeps the RSVP when reached", () => {
    const first = planAttempt({ campaignStatus: "open", row: row(), input: { outcome: "voicemail" }, actorUid: "bob", actorIsSuperAdmin: false });
    expect(first).toMatchObject({ ok: true, row: { outcome: "voicemail", rsvp: null, attemptCount: 1 }, countsDelta: { attempted: 1 } });
    if (!first.ok) throw new Error();
    const second = planAttempt({ campaignStatus: "open", row: first.row, input: { outcome: "reached", rsvp: "yes" }, actorUid: "bob", actorIsSuperAdmin: false });
    expect(second).toMatchObject({ ok: true, row: { outcome: "reached", rsvp: "yes", attemptCount: 2 }, countsDelta: { reached: 1, done: 1, rsvpYes: 1 } });
    if (!second.ok) throw new Error();
    // A later call-back without a new RSVP keeps the old answer; the person is no longer "done".
    const third = planAttempt({ campaignStatus: "open", row: second.row, input: { outcome: "callback" }, actorUid: "bob", actorIsSuperAdmin: false });
    expect(third).toMatchObject({ ok: true, row: { outcome: "callback", rsvp: "yes", attemptCount: 3 }, countsDelta: { reached: -1, done: -1 } });
    // Reached again with a changed mind.
    if (!third.ok) throw new Error();
    const fourth = planAttempt({ campaignStatus: "open", row: third.row, input: { outcome: "reached", rsvp: "no" }, actorUid: "bob", actorIsSuperAdmin: false });
    expect(fourth).toMatchObject({ ok: true, row: { rsvp: "no" }, countsDelta: { reached: 1, done: 1, rsvpYes: -1, rsvpNo: 1 } });
  });

  it("refuses a closed campaign, another caller's person, a bad outcome and an RSVP without reaching them", () => {
    expect(planAttempt({ campaignStatus: "closed", row: row(), input: { outcome: "reached" }, actorUid: "bob", actorIsSuperAdmin: false })).toMatchObject({ ok: false, status: 409 });
    expect(planAttempt({ campaignStatus: "open", row: row(), input: { outcome: "reached" }, actorUid: "ann", actorIsSuperAdmin: false })).toMatchObject({ ok: false, status: 403 });
    expect(planAttempt({ campaignStatus: "open", row: row(), input: { outcome: "reached" }, actorUid: "ann", actorIsSuperAdmin: true })).toMatchObject({ ok: true });
    expect(planAttempt({ campaignStatus: "open", row: row(), input: { outcome: "nope" as never }, actorUid: "bob", actorIsSuperAdmin: false })).toMatchObject({ ok: false, status: 400 });
    expect(planAttempt({ campaignStatus: "open", row: row(), input: { outcome: "voicemail", rsvp: "yes" }, actorUid: "bob", actorIsSuperAdmin: false })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("counts", () => {
  const rows: CallRow[] = [
    row({ memberId: "a", callerUid: "ann", outcome: "reached", rsvp: "yes", attemptCount: 1 }),
    row({ memberId: "b", callerUid: "ann", outcome: "voicemail", attemptCount: 2 }),
    row({ memberId: "c", callerUid: "bob", outcome: "declined", attemptCount: 1 }),
    row({ memberId: "d", callerUid: "bob" }),
    row({ memberId: "e", callerUid: "bob", outcome: "reached", rsvp: "maybe", attemptCount: 3 })
  ];

  it("totals match the rows and the deltas add up", () => {
    expect(computeCounts(rows)).toEqual({ total: 5, attempted: 4, reached: 2, done: 3, rsvpYes: 1, rsvpNo: 0, rsvpMaybe: 1 });
    let counts = computeCounts(rows);
    const plan = planAttempt({ campaignStatus: "open", row: rows[3], input: { outcome: "reached", rsvp: "no" }, actorUid: "bob", actorIsSuperAdmin: false });
    if (!plan.ok) throw new Error();
    counts = { ...counts };
    for (const [key, diff] of Object.entries(plan.countsDelta)) counts[key as keyof typeof counts] += diff;
    expect(counts).toEqual(computeCounts([rows[0], rows[1], rows[2], plan.row, rows[4]]));
  });

  it("splits progress per caller", () => {
    expect(progressByCaller(rows)).toEqual([
      { callerUid: "ann", total: 2, attempted: 2, reached: 1, done: 1, rsvpYes: 1, rsvpNo: 0, rsvpMaybe: 0 },
      { callerUid: "bob", total: 3, attempted: 2, reached: 1, done: 2, rsvpYes: 0, rsvpNo: 0, rsvpMaybe: 1 }
    ]);
  });

  it("knows which outcomes end the calling", () => {
    expect(isFinalOutcome("reached")).toBe(true);
    expect(isFinalOutcome("wrong_number")).toBe(true);
    expect(isFinalOutcome("voicemail")).toBe(false);
    expect(isFinalOutcome(null)).toBe(false);
  });
});

describe("helpers", () => {
  it("binds the script and notes to the campaign, member and attempt", () => {
    expect(campaignScriptLoc("c1")).toEqual({ path: "organizations/ghmo/callCampaigns", docId: "c1#script" });
    expect(attemptNoteLoc("c1", "m1", "a9")).toEqual({ path: "organizations/ghmo/callCampaigns", docId: "c1/m1#a9" });
  });

  it("cleans titles", () => {
    expect(normalizeTitle("  General   meeting \n")).toBe("General meeting");
    expect(normalizeTitle(42)).toBe("");
    expect(normalizeTitle("x".repeat(200))).toHaveLength(150);
  });

  it("writes a CSV with names and outcomes, quoting as needed, and nothing else", () => {
    const csv = campaignCsv([
      { memberId: "a", callerUid: "ann", outcome: "reached", rsvp: "yes", attemptCount: 2, name: 'Lee, "Sam"', email: "sam@example.org", callerName: "Ann", lastAttemptAt: Date.UTC(2026, 9, 31) },
      { memberId: "b", callerUid: "ann", outcome: null, rsvp: null, attemptCount: 0, name: "Pat", email: "pat@example.org", callerName: "Ann", lastAttemptAt: null }
    ]);
    expect(csv.split("\n")).toEqual([
      "Name,Email,Caller,Outcome,RSVP,Attempts,Last attempt",
      '"Lee, ""Sam""",sam@example.org,Ann,Reached,Coming,2,2026-10-31T00:00:00.000Z',
      "Pat,pat@example.org,Ann,,,0,",
      ""
    ]);
  });
});
