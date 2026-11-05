/**
 * Officer positions and who holds them (plan §15, Phase 11-A). Pure rules: the server libs load the stored
 * records and these functions decide. Positions are an editable list (a catalogue); each holder has a term
 * with a start and an optional end date, so past officers stay on record. Dates are plain "YYYY-MM-DD"
 * strings in the organisation's time zone, so there is no time-of-day or daylight-saving drift to reason about.
 */

export const POSITION_TIME_ZONE = "America/New_York";

export type Position = {
  id: string;
  title: string;
  titleNe: string;
  order: number;
  active: boolean;
  builtIn: boolean;
  /** Several people may hold it at once (board members, advisors); otherwise a new holder normally replaces the last one. */
  multiple: boolean;
};

export type Term = {
  id: string;
  positionId: string;
  memberId: string;
  startsOn: string;
  endsOn: string | null;
  note: string;
};

export type DefaultPosition = Pick<Position, "id" | "title" | "titleNe" | "multiple">;

/**
 * Seeded the first time the Positions page opens. The titles are the standing officer roles from the wedding
 * certificate's role list (English and Nepali), which stays as it is because saved certificates store its values.
 */
export const DEFAULT_POSITIONS: DefaultPosition[] = [
  { id: "president", title: "President", titleNe: "अध्यक्ष", multiple: false },
  { id: "vice_president", title: "Vice President", titleNe: "उपाध्यक्ष", multiple: false },
  { id: "senior_vice_president", title: "Senior Vice President", titleNe: "वरिष्ठ उपाध्यक्ष", multiple: false },
  { id: "general_secretary", title: "General Secretary", titleNe: "महासचिव", multiple: false },
  { id: "secretary", title: "Secretary", titleNe: "सचिव", multiple: false },
  { id: "joint_secretary", title: "Joint Secretary", titleNe: "सह–सचिव", multiple: false },
  { id: "treasurer", title: "Treasurer", titleNe: "कोषाध्यक्ष", multiple: false },
  { id: "joint_treasurer", title: "Joint Treasurer", titleNe: "सह–कोषाध्यक्ष", multiple: false },
  { id: "chief_advisor", title: "Chief Advisor", titleNe: "मुख्य सल्लाहकार", multiple: false },
  { id: "advisor", title: "Advisor", titleNe: "सल्लाहकार", multiple: true },
  { id: "executive_member", title: "Executive Member", titleNe: "कार्यसमिति सदस्य", multiple: true },
  { id: "board_member", title: "Board Member", titleNe: "बोर्ड सदस्य", multiple: true },
  { id: "program_coordinator", title: "Program Coordinator", titleNe: "कार्यक्रम संयोजक", multiple: false },
  { id: "cultural_coordinator", title: "Cultural Coordinator", titleNe: "सांस्कृतिक संयोजक", multiple: false },
  { id: "youth_coordinator", title: "Youth Coordinator", titleNe: "युवा संयोजक", multiple: false },
  { id: "womens_coordinator", title: "Women’s Coordinator", titleNe: "महिला संयोजक", multiple: false }
];

export const TITLE_MAX = 80;
export const NOTE_MAX = 200;

export function cleanTitle(value: unknown, max: number = TITLE_MAX): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// ---- Dates ----

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in "YYYY-MM-DD" form (so "2026-02-30" is refused). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today's date in the organisation's time zone, as "YYYY-MM-DD". */
export function todayIn(now: Date = new Date(), timeZone: string = POSITION_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** `date` plus or minus whole days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ---- Terms ----

export type TermStatus = "upcoming" | "current" | "past";

export function termStatus(term: Pick<Term, "startsOn" | "endsOn">, today: string): TermStatus {
  if (term.startsOn > today) return "upcoming";
  if (term.endsOn !== null && term.endsOn < today) return "past";
  return "current";
}

/** Two date ranges overlap when each starts on or before the other ends; a missing end means "no end yet". */
export function rangesOverlap(a: Pick<Term, "startsOn" | "endsOn">, b: Pick<Term, "startsOn" | "endsOn">): boolean {
  const aEndsAfterBStarts = a.endsOn === null || a.endsOn >= b.startsOn;
  const bEndsAfterAStarts = b.endsOn === null || b.endsOn >= a.startsOn;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}

export type TermPlan = { ok: true; closes: { termId: string; endsOn: string }[] } | { ok: false; error: string };

/**
 * Checks a new term for `memberId` against the position's other terms and says which earlier terms to close.
 *  - the dates must be real and the end on or after the start;
 *  - the same person can't hold the same position twice over the same dates;
 *  - if someone else holds it over those dates, either `endPrevious` is set (their term ends the day before this
 *    one starts) or the position allows several holders. A holder who starts on or after the new start date can't be
 *    ended "before" they began, so that is refused.
 */
export function planTerm(params: {
  terms: Term[];
  position: Pick<Position, "title" | "multiple">;
  memberId: string;
  startsOn: unknown;
  endsOn: unknown;
  endPrevious: boolean;
}): TermPlan {
  const { terms, position, memberId, endPrevious } = params;
  if (!isValidDate(params.startsOn)) return { ok: false, error: "Enter the start date." };
  const startsOn = params.startsOn;
  let endsOn: string | null = null;
  if (params.endsOn !== null && params.endsOn !== undefined && params.endsOn !== "") {
    if (!isValidDate(params.endsOn)) return { ok: false, error: "The end date isn't a real date." };
    endsOn = params.endsOn;
    if (endsOn < startsOn) return { ok: false, error: "The end date is before the start date." };
  }
  const candidate = { startsOn, endsOn };
  const overlapping = terms.filter(term => rangesOverlap(term, candidate));

  if (overlapping.some(term => term.memberId === memberId)) {
    return { ok: false, error: `They already hold ${position.title} on those dates.` };
  }
  const others = overlapping.filter(term => term.memberId !== memberId);
  if (others.length === 0) return { ok: true, closes: [] };

  if (endPrevious) {
    if (others.some(term => term.startsOn >= startsOn)) {
      return { ok: false, error: "Someone else starts on or after that date, so their term can't be ended before it begins. Change the date." };
    }
    return { ok: true, closes: others.map(term => ({ termId: term.id, endsOn: addDays(startsOn, -1) })) };
  }
  if (position.multiple) return { ok: true, closes: [] };
  return { ok: false, error: `Someone else already holds ${position.title} on those dates. End their term the day before, or change the dates.` };
}

/** Terms that could be edited into a new range: the same overlap rule for one person, ignoring the term itself. */
export function termEditConflict(params: { terms: Term[]; termId: string; memberId: string; startsOn: string; endsOn: string | null }): string | null {
  if (params.endsOn !== null && params.endsOn < params.startsOn) return "The end date is before the start date.";
  const clash = params.terms.some(
    term => term.id !== params.termId && term.memberId === params.memberId && rangesOverlap(term, { startsOn: params.startsOn, endsOn: params.endsOn })
  );
  return clash ? "They already hold this position on those dates." : null;
}

// ---- Views ----

/** Position ids each member holds right now, for badges and filters. */
export function currentPositionIdsByMember(terms: Term[], today: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const term of terms) {
    if (termStatus(term, today) !== "current") continue;
    (out[term.memberId] ??= []).push(term.positionId);
  }
  return out;
}

/** Positions in their list order, then by title. */
export function sortPositions<T extends Pick<Position, "order" | "title">>(positions: T[]): T[] {
  return [...positions].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Newest term first: current and upcoming ahead of past ones, then by start date, latest first. */
export function sortTermsNewestFirst<T extends Pick<Term, "startsOn" | "endsOn">>(terms: T[]): T[] {
  return [...terms].sort((a, b) => b.startsOn.localeCompare(a.startsOn) || (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"));
}

/** "Mar 2025", for "since Mar 2025". */
export function monthYear(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
