/**
 * Minutes for any meeting (plan §26, Phase 19). Pure rules: whether draft minutes may move to another meeting (D67),
 * and which past meetings fall on the day someone is about to record as a new one (D64).
 */

export type MoveTarget = { id: string; title: string; startsAtMs: number | null } | null;

export type MovePlan = { ok: true; eventTitle: string } | { ok: false; status: number; error: string };

export function planMinutesMove(input: { status: unknown; currentEventId: unknown; target: MoveTarget; targetHasMinutes: boolean; nowMs: number }): MovePlan {
  const { status, currentEventId, target, targetHasMinutes, nowMs } = input;
  if (status !== "draft") return { ok: false, status: 409, error: "Only draft minutes can move to another meeting. Return them to draft first." };
  if (!target) return { ok: false, status: 404, error: "That meeting wasn't found. It may have been deleted." };
  if (target.id === currentEventId) return { ok: false, status: 400, error: "These minutes already belong to that meeting." };
  if (target.startsAtMs === null || !Number.isFinite(target.startsAtMs) || target.startsAtMs > nowMs) {
    return { ok: false, status: 400, error: "Minutes belong to a meeting that has already happened. Pick a past meeting." };
  }
  if (targetHasMinutes) return { ok: false, status: 409, error: "That meeting already has minutes. Pick another, or open those minutes instead." };
  return { ok: true, eventTitle: target.title.trim() || "Untitled Event" };
}

/** The calendar day of a moment in a time zone, as "YYYY-MM-DD". */
export function dayKeyIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Past meetings held on the same day as the one about to be recorded, so the form can offer them first (D64). */
export function sameDayMeetings<T extends { startsAtMs: number }>(events: T[], day: string, timeZone: string): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return events.filter(event => Number.isFinite(event.startsAtMs) && dayKeyIn(event.startsAtMs, timeZone) === day);
}
