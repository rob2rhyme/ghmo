import { normalizeMemberEmail, normalizeMemberName } from "./members";
import { suppressionToKeep, type SuppressionReason } from "./memberDeletion";

/**
 * Changing a member's email (plan §25, Phase 18). The rules in one pure function, so the route only reads, calls this
 * and writes. Decisions: D58 (add, change, remove), D59 (one address, one member), D60 (consent and opt-out stay with
 * the person; a bounce belonged to the old address), D61 (an opted-out or bounced old address goes on the
 * do-not-email list), D62 (the sign-in link is reset).
 */

export type EmailChangeKind = "added" | "changed" | "removed";

export type EmailChangeInput = {
  before: { email?: string | null; emailLower?: string | null; name?: string | null; hasPhone?: boolean | null; emailOptOutAt?: unknown; emailBounced?: unknown };
  /** The new address as typed; empty removes it. Its format is checked by the route. */
  newEmail: string;
  /** Another member who already has the new address, if any. */
  duplicateOf: { id: string; name: string } | null;
  /** The do-not-email record of the new address, if it has one. */
  suppression: { reason: SuppressionReason; at: Date } | null;
  now: Date;
};

export type EmailChangePlan =
  | { ok: true; kind: EmailChangeKind; updates: Record<string, unknown>; emailLower: string; keepOld: { emailLower: string; reason: SuppressionReason } | null }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): EmailChangePlan => ({ ok: false, status, error });

export function planEmailChange(input: EmailChangeInput): EmailChangePlan {
  const { before, duplicateOf, suppression, now } = input;
  const typed = input.newEmail.trim();
  const next = normalizeMemberEmail(typed);
  const current = normalizeMemberEmail(before.emailLower ?? "");
  const hadEmail = current.includes("@");

  if (!next) {
    if (!hadEmail) return refuse(400, "This member has no email address to remove.");
    if (!before.hasPhone || !normalizeMemberName(before.name)) {
      return refuse(400, "Someone without an email needs a name and a phone number. Add those first, then remove the email.");
    }
  } else {
    if (typed === (before.email ?? "").trim() && next === current) return refuse(400, "That is already their email address.");
    if (duplicateOf) return refuse(409, `${duplicateOf.name} already uses this address. One address can belong to only one member.`);
  }

  const kind: EmailChangeKind = !next ? "removed" : hadEmail ? "changed" : "added";
  // Only the letters' case changed: the same address, so nothing else about it changes either.
  if (next === current) return { ok: true, kind, emailLower: next, keepOld: null, updates: { email: typed, updatedAt: now } };

  const updates: Record<string, unknown> = {
    email: next ? typed : null,
    // "" rather than missing, so the member list (ordered by this field) still includes phone-only members.
    emailLower: next,
    uid: null,
    emailBounced: false,
    updatedAt: now
  };
  if (suppression?.reason === "bounced") updates.emailBounced = true;
  if (suppression?.reason === "opted_out" && !before.emailOptOutAt) updates.emailOptOutAt = suppression.at;

  const oldReason = hadEmail ? suppressionToKeep({ emailLower: current, emailOptOutAt: before.emailOptOutAt, emailBounced: before.emailBounced }) : null;
  return { ok: true, kind, emailLower: next, keepOld: oldReason ? { emailLower: current, reason: oldReason } : null, updates };
}
