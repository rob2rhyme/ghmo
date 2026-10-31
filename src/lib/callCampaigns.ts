/**
 * Call campaigns (plan §12, Phase 9-C): for one announcement, each caller phones the people assigned
 * to them in the calling tree and records what happened. Pure rules here; storage in
 * `callCampaigns.server.ts`; the script and call notes travel as encrypted envelopes.
 */
import type { RecordLocation } from "./e2ee/envelope";

export const CALL_CAMPAIGNS_PATH = "organizations/ghmo/callCampaigns";
/** The agenda and talking points, encrypted and bound to the campaign. */
export const campaignScriptLoc = (campaignId: string): RecordLocation => ({ path: CALL_CAMPAIGNS_PATH, docId: `${campaignId}#script` });
/** A note on one attempt, encrypted and bound to campaign, member and attempt. */
export const attemptNoteLoc = (campaignId: string, memberId: string, attemptId: string): RecordLocation => ({
  path: CALL_CAMPAIGNS_PATH,
  docId: `${campaignId}/${memberId}#${attemptId}`
});

export const OUTCOMES = ["reached", "voicemail", "no_answer", "wrong_number", "callback", "declined"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const isOutcome = (value: unknown): value is Outcome => typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);

export const OUTCOME_LABELS: Record<Outcome, string> = {
  reached: "Reached",
  voicemail: "Left voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number",
  callback: "Call back later",
  declined: "Declined"
};

export const RSVPS = ["yes", "no", "maybe"] as const;
export type Rsvp = (typeof RSVPS)[number];
export const isRsvp = (value: unknown): value is Rsvp => typeof value === "string" && (RSVPS as readonly string[]).includes(value);
export const RSVP_LABELS: Record<Rsvp, string> = { yes: "Coming", no: "Not coming", maybe: "Maybe" };

/** "Done" means the caller need not try again: the person was reached, declined, or the number is wrong. */
export const FINAL_OUTCOMES: readonly Outcome[] = ["reached", "declined", "wrong_number"];
export const isFinalOutcome = (outcome: Outcome | null | undefined) => Boolean(outcome && FINAL_OUTCOMES.includes(outcome));

export type CampaignStatus = "open" | "closed";

export type CallRow = {
  memberId: string;
  callerUid: string;
  outcome: Outcome | null;
  rsvp: Rsvp | null;
  attemptCount: number;
};

export type CampaignCounts = {
  total: number;
  attempted: number;
  reached: number;
  done: number;
  rsvpYes: number;
  rsvpNo: number;
  rsvpMaybe: number;
};

export type CallerProgress = CampaignCounts & { callerUid: string };

export const EMPTY_COUNTS: CampaignCounts = { total: 0, attempted: 0, reached: 0, done: 0, rsvpYes: 0, rsvpNo: 0, rsvpMaybe: 0 };

function add(counts: CampaignCounts, row: CallRow): void {
  counts.total += 1;
  if (row.attemptCount > 0) counts.attempted += 1;
  if (row.outcome === "reached") counts.reached += 1;
  if (isFinalOutcome(row.outcome)) counts.done += 1;
  if (row.rsvp === "yes") counts.rsvpYes += 1;
  if (row.rsvp === "no") counts.rsvpNo += 1;
  if (row.rsvp === "maybe") counts.rsvpMaybe += 1;
}

/** Totals from the rows themselves; the stored counts must always equal this. */
export function computeCounts(rows: CallRow[]): CampaignCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) add(counts, row);
  return counts;
}

/** Progress per caller, in the order callers first appear (then by uid for the rest). */
export function progressByCaller(rows: CallRow[]): CallerProgress[] {
  const map = new Map<string, CallerProgress>();
  for (const row of rows) {
    const entry = map.get(row.callerUid) ?? { ...EMPTY_COUNTS, callerUid: row.callerUid };
    add(entry, row);
    map.set(row.callerUid, entry);
  }
  return [...map.values()].sort((a, b) => a.callerUid.localeCompare(b.callerUid));
}

export type AttemptInput = { outcome: Outcome; rsvp?: Rsvp | null };

export type AttemptPlan =
  | { ok: true; row: CallRow; countsDelta: Partial<Record<keyof CampaignCounts, number>> }
  | { ok: false; status: number; error: string };

/**
 * Records one attempt on a row: the outcome always becomes the latest one; an RSVP given now replaces
 * the earlier one, and is only meaningful when the person was reached. The counts delta lets the
 * stored campaign totals move without re-reading every row.
 */
export function planAttempt(params: { campaignStatus: CampaignStatus; row: CallRow; input: AttemptInput; actorUid: string; actorIsSuperAdmin: boolean }): AttemptPlan {
  const { campaignStatus, row, input, actorUid, actorIsSuperAdmin } = params;
  if (campaignStatus !== "open") return { ok: false, status: 409, error: "This campaign is closed." };
  if (row.callerUid !== actorUid && !actorIsSuperAdmin) return { ok: false, status: 403, error: "This person is assigned to another caller." };
  if (!isOutcome(input.outcome)) return { ok: false, status: 400, error: "Pick an outcome." };
  if (input.rsvp && input.outcome !== "reached") return { ok: false, status: 400, error: "An RSVP can only be recorded when the person was reached." };
  const next: CallRow = {
    ...row,
    outcome: input.outcome,
    rsvp: input.outcome === "reached" ? (input.rsvp ?? row.rsvp) : row.rsvp,
    attemptCount: row.attemptCount + 1
  };
  const before = computeCounts([row]);
  const after = computeCounts([next]);
  const countsDelta: Partial<Record<keyof CampaignCounts, number>> = {};
  for (const key of Object.keys(after) as (keyof CampaignCounts)[]) {
    const diff = after[key] - before[key];
    if (diff !== 0) countsDelta[key] = diff;
  }
  return { ok: true, row: next, countsDelta };
}

export const TITLE_MAX = 150;

export function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) : "";
}

type ExportRow = CallRow & { name: string; email: string; callerName: string; lastAttemptAt: number | null };

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A CSV of the campaign's rows for the BOD: names, callers and outcomes, never a number or a note. */
export function campaignCsv(rows: ExportRow[]): string {
  const header = ["Name", "Email", "Caller", "Outcome", "RSVP", "Attempts", "Last attempt"];
  const lines = rows.map(row =>
    [
      row.name,
      row.email,
      row.callerName,
      row.outcome ? OUTCOME_LABELS[row.outcome] : "",
      row.rsvp ? RSVP_LABELS[row.rsvp] : "",
      row.attemptCount,
      row.lastAttemptAt ? new Date(row.lastAttemptAt).toISOString() : ""
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
