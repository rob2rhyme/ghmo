/**
 * Pure rules for deleting a member (plan §20, Phase 15). No network, no database.
 *
 * Deleting is for a removal request or a record made by mistake; disabling stays the normal way to stop contact.
 */

/** What points at a member, counted before a deletion (for the preview) and again as it runs (for the record). */
export type DeletionCounts = {
  notes: number;
  assignment: number;
  callRows: number;
  callAttempts: number;
  deliveries: number;
  reminders: number;
  tasks: number;
  groupsLed: number;
  groups: number;
  /** Officer terms are kept as history (D43). */
  officerTerms: number;
};

export const EMPTY_COUNTS: DeletionCounts = { notes: 0, assignment: 0, callRows: 0, callAttempts: 0, deliveries: 0, reminders: 0, tasks: 0, groupsLed: 0, groups: 0, officerTerms: 0 };

const squash = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The text a super admin must type to confirm: the member's name, or their email when they have no name. Case and spacing
 * are ignored, so a stray capital or double space does not block a real deletion; anything else does.
 */
export function confirmationMatches(typed: unknown, member: { name?: string | null; emailLower?: string | null }): boolean {
  if (typeof typed !== "string") return false;
  const expected = squash(member.name || member.emailLower || "");
  return expected.length > 0 && squash(typed) === expected;
}

/** What the person is asked to type, shown in the dialog. */
export const confirmationTarget = (member: { name?: string | null; emailLower?: string | null }) => member.name || member.emailLower || "";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The plain-words list for the preview: what goes, and what stays. Lines with nothing to remove are left out. */
export function deletionSummary(counts: DeletionCounts): { removed: string[]; kept: string[] } {
  const removed = ["Their record: name, email, status, consent history, member since, city and state, and the encrypted contact (phone numbers and family)"];
  if (counts.notes > 0) removed.push(plural(counts.notes, "note", "notes"));
  if (counts.callRows > 0) removed.push(`${plural(counts.callRows, "call record", "call records")} in campaigns, with ${plural(counts.callAttempts, "attempt", "attempts")}, their notes and ratings`);
  if (counts.assignment > 0) removed.push("Their place in the calling tree");
  if (counts.deliveries > 0) removed.push(plural(counts.deliveries, "broadcast delivery record", "broadcast delivery records"));
  if (counts.reminders > 0) removed.push(plural(counts.reminders, "task reminder record", "task reminder records"));
  if (counts.tasks > 0) removed.push(`Their name on ${plural(counts.tasks, "task", "tasks")}`);
  if (counts.groups > 0) removed.push(`Their place in ${plural(counts.groups, "group", "groups")}${counts.groupsLed > 0 ? ` (and as lead of ${counts.groupsLed})` : ""}`);
  else if (counts.groupsLed > 0) removed.push(`Being lead of ${plural(counts.groupsLed, "group", "groups")}`);
  const kept = [
    "The activity log is never edited, so older entries may still name them. The deletion is added as a new entry without their name or email",
    "Names written in meeting minutes or in Plans & Issues text, and any earlier exports or backups"
  ];
  if (counts.officerTerms > 0) kept.unshift(`${plural(counts.officerTerms, "officer term", "officer terms")} stay as history, shown as "Removed member"`);
  return { removed, kept };
}

export type SuppressionReason = "opted_out" | "bounced";

/**
 * Whether deleting this member must leave a "do not email" record (D44): they unsubscribed or complained, or their
 * address bounced, and there is an address to protect. The record is only a hash of the address.
 */
export function suppressionToKeep(member: { emailLower?: string | null; emailOptOutAt?: unknown; emailBounced?: unknown }): SuppressionReason | null {
  if (!member.emailLower?.includes("@")) return null;
  if (member.emailOptOutAt) return "opted_out";
  if (member.emailBounced === true) return "bounced";
  return null;
}

/** A member added again at an address that has a do-not-email record starts out opted out (or bounced), never ready. */
export function newMemberSuppression(record: { reason?: unknown; at?: unknown } | null | undefined): { emailOptOutAt?: Date; emailBounced?: true } {
  if (!record) return {};
  const at = record.at instanceof Date ? record.at : new Date();
  return record.reason === "bounced" ? { emailBounced: true } : { emailOptOutAt: at };
}

/** The label that stands in for a person whose record was deleted, in officer history and similar lists. */
export const REMOVED_MEMBER_LABEL = "Removed member";
