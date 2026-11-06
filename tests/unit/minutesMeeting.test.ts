import { describe, expect, it } from "vitest";
import { dayKeyIn, planMinutesMove, sameDayMeetings } from "@/src/lib/minutesMeeting";

const now = Date.UTC(2026, 10, 6, 17);
const past = { id: "e2", title: " Board call ", startsAtMs: Date.UTC(2026, 10, 1, 23) };
const base = { status: "draft", currentEventId: "e1", target: past, targetHasMinutes: false, nowMs: now };

describe("planMinutesMove", () => {
  it("moves draft minutes to a past meeting without minutes", () => {
    expect(planMinutesMove(base)).toEqual({ ok: true, eventTitle: "Board call" });
    expect(planMinutesMove({ ...base, target: { ...past, title: "  " } })).toEqual({ ok: true, eventTitle: "Untitled Event" });
  });

  it("refuses everything else in plain words", () => {
    expect(planMinutesMove({ ...base, status: "submitted" })).toMatchObject({ ok: false, status: 409 });
    expect(planMinutesMove({ ...base, status: "approved" })).toMatchObject({ ok: false, status: 409 });
    expect(planMinutesMove({ ...base, target: null })).toMatchObject({ ok: false, status: 404 });
    expect(planMinutesMove({ ...base, currentEventId: "e2" })).toMatchObject({ ok: false, status: 400 });
    expect(planMinutesMove({ ...base, target: { ...past, startsAtMs: now + 60_000 } })).toMatchObject({ ok: false, status: 400 });
    expect(planMinutesMove({ ...base, target: { ...past, startsAtMs: null } })).toMatchObject({ ok: false, status: 400 });
    expect(planMinutesMove({ ...base, targetHasMinutes: true })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already has minutes") });
  });
});

describe("same-day meetings", () => {
  const zone = "America/New_York";
  it("uses the meeting's own day in the community's time zone", () => {
    // 23:00 UTC on 1 Nov is 7 PM in New York the same day; 02:00 UTC on 2 Nov is still 1 Nov there.
    expect(dayKeyIn(Date.UTC(2026, 10, 1, 23), zone)).toBe("2026-11-01");
    expect(dayKeyIn(Date.UTC(2026, 10, 2, 2), zone)).toBe("2026-11-01");
  });

  it("finds the meetings on that day only", () => {
    const events = [past, { id: "e3", title: "Late", startsAtMs: Date.UTC(2026, 10, 2, 2) }, { id: "e4", title: "Next day", startsAtMs: Date.UTC(2026, 10, 2, 18) }];
    expect(sameDayMeetings(events, "2026-11-01", zone).map(e => e.id)).toEqual(["e2", "e3"]);
    expect(sameDayMeetings(events, "", zone)).toEqual([]);
    expect(sameDayMeetings(events, "11/01/2026", zone)).toEqual([]);
  });
});
