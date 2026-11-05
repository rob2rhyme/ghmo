import { normalizePhone, type FamilyMember, type MemberContact } from "./members";
import { isValidDate, monthYear } from "./positions";

/**
 * Pure rules for the member profile (plan §17, 13-A): how long someone has been a member, their city and state
 * (no street address, D31), and their family members (D29). No I/O, so they are unit tested on their own.
 */

export const CITY_MAX = 80;
export const STATE_MAX = 40;
export const FAMILY_NAME_MAX = 80;
export const FAMILY_RELATION_MAX = 40;
export const MAX_FAMILY = 10;
/** No one in this community joined before this; a typo like 1019 is refused. */
export const EARLIEST_MEMBER_SINCE = "1950-01-01";

export const US_STATES: readonly (readonly [code: string, name: string])[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"], ["PR", "Puerto Rico"]
];

const squash = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export const cleanCity = (value: unknown): string => squash(value, CITY_MAX);

/**
 * A US state as its two-letter code ("pa", "Pennsylvania" and "PA" all become "PA"); anything else, for a place outside
 * the US, is kept as typed.
 */
export function normalizeState(value: unknown): string {
  const text = squash(value, STATE_MAX);
  if (!text) return "";
  const lower = text.toLowerCase().replace(/\./g, "");
  const match = US_STATES.find(([code, name]) => code.toLowerCase() === lower || name.toLowerCase() === lower);
  return match ? match[0] : text;
}

/** "Harrisburg, PA", or whichever part is known, or "" when neither is. */
export const locationLabel = (city?: string | null, state?: string | null): string => [city?.trim(), state?.trim()].filter(Boolean).join(", ");

/** An error sentence for a member-since date, or null when it is fine (a real day, after 1950, not in the future). */
export function checkMemberSince(value: unknown, today: string): string | null {
  if (!isValidDate(value)) return "Enter a real date.";
  if (value < EARLIEST_MEMBER_SINCE) return "That date is too early. Check the year.";
  if (value > today) return "A member can't have joined in the future.";
  return null;
}

export type MembershipLength = { years: number; months: number; totalMonths: number };

/** Whole years and months from `since` to `today` (both "YYYY-MM-DD"); a month counts once its day of the month is reached. */
export function membershipLength(since: string, today: string): MembershipLength {
  const [sy, sm, sd] = since.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let totalMonths = (ty - sy) * 12 + (tm - sm);
  if (td < sd) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "6 years, 8 months", "1 year", "3 months", or "less than a month". */
export function lengthLabel(length: MembershipLength): string {
  if (length.totalMonths < 1) return "less than a month";
  const parts = [];
  if (length.years > 0) parts.push(plural(length.years, "year"));
  if (length.months > 0) parts.push(plural(length.months, "month"));
  return parts.join(", ");
}

/** "Member since Mar 2019 · 6 years, 8 months". */
export function memberSinceLine(since: string, today: string): string {
  return `Member since ${monthYear(since)} · ${lengthLabel(membershipLength(since, today))}`;
}

export type FamilyResult = { ok: true; family: FamilyMember[] } | { ok: false; error: string };

/**
 * Cleans the family list a person typed: blank rows are dropped, a name is required, a phone number (optional) must be
 * a real one and is stored as E.164, and there can be at most ten.
 */
export function normalizeFamily(input: unknown): FamilyResult {
  if (!Array.isArray(input)) return { ok: true, family: [] };
  const family: FamilyMember[] = [];
  for (const entry of input) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const name = squash(row.name, FAMILY_NAME_MAX);
    const relationship = squash(row.relationship, FAMILY_RELATION_MAX);
    const phoneText = typeof row.phone === "string" ? row.phone.trim() : "";
    if (!name && !relationship && !phoneText) continue;
    if (!name) return { ok: false, error: "Give each family member a name." };
    let phone: string | undefined;
    if (phoneText) {
      const normalized = normalizePhone(phoneText);
      if (!normalized) return { ok: false, error: `The number for ${name} is not recognized. Use 10 digits for US numbers, or +country code for others.` };
      phone = normalized;
    }
    family.push({ name, ...(relationship ? { relationship } : {}), ...(phone ? { phone } : {}) });
  }
  if (family.length > MAX_FAMILY) return { ok: false, error: `A profile can list at most ${MAX_FAMILY} family members.` };
  return { ok: true, family };
}

/** The contact with its family list replaced (or removed when the list is empty). */
export function withFamily(contact: MemberContact, family: FamilyMember[] | undefined): MemberContact {
  const { family: _old, ...rest } = contact;
  void _old;
  return family && family.length > 0 ? { ...rest, family } : rest;
}

/** True when the contact holds nothing at all, so the envelope can be removed. */
export const contactIsEmpty = (contact: MemberContact): boolean => Object.keys(withFamily(contact, contact.family)).length === 0;
