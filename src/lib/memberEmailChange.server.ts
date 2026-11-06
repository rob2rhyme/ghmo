import "server-only";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgMembersCollectionPath } from "./firestorePaths";
import { fail, type Failure } from "./adminRoute.server";
import { suppressionRef, suppressionsFor } from "./memberDeletion.server";
import { memberDisplayName, normalizeMemberEmail } from "./members";
import { planEmailChange, type EmailChangeKind } from "./memberEmailChange";

const membersCol = () => getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG));

const asDate = (value: unknown, fallback: Date): Date => (value instanceof Date ? value : ((value as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? fallback));

/** Another member who already has this address (D59), or null. `exceptId` is the member being changed. */
export async function memberUsingEmail(emailLower: string, exceptId?: string, tx?: FirebaseFirestore.Transaction): Promise<{ id: string; name: string } | null> {
  const address = normalizeMemberEmail(emailLower);
  if (!address.includes("@")) return null;
  const query = membersCol().where("emailLower", "==", address).limit(2);
  const snap = tx ? await tx.get(query) : await query.get();
  const other = snap.docs.find(doc => doc.id !== exceptId);
  return other ? { id: other.id, name: memberDisplayName({ name: other.get("name") as string | null, emailLower: address }) } : null;
}

export type EmailChangeResult = { ok: true; kind: EmailChangeKind; oldKept: boolean; member: Record<string, unknown> } | Failure;

/**
 * Changes, adds or removes a member's email in one transaction (plan §25): the member and the duplicate check are read
 * inside it, so two admins can't give the same address to two people at once. When the old address had opted out or
 * bounced, its do-not-email record is written in the same transaction (D61).
 */
export async function changeMemberEmail(input: { memberId: string; newEmail: string; now: Date }): Promise<EmailChangeResult> {
  const next = normalizeMemberEmail(input.newEmail);
  // The do-not-email list is keyed by a hash and never changes inside the transaction, so it is read first.
  const suppression = next ? ((await suppressionsFor([next])).get(next) ?? null) : null;
  const ref = membersCol().doc(input.memberId);
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail(404, "Member not found");
    const before = snap.data() as Record<string, unknown>;
    const duplicateOf = next ? await memberUsingEmail(next, input.memberId, tx) : null;
    const plan = planEmailChange({
      before: {
        email: before.email as string | null,
        emailLower: before.emailLower as string | null,
        name: before.name as string | null,
        hasPhone: before.hasPhone === true,
        emailOptOutAt: before.emailOptOutAt,
        emailBounced: before.emailBounced
      },
      newEmail: input.newEmail,
      duplicateOf,
      suppression,
      now: input.now
    });
    if (!plan.ok) return fail(plan.status, plan.error);
    tx.set(ref, plan.updates, { merge: true });
    if (plan.keepOld) {
      const at = plan.keepOld.reason === "opted_out" ? asDate(before.emailOptOutAt, input.now) : input.now;
      tx.set(suppressionRef(plan.keepOld.emailLower), { reason: plan.keepOld.reason, at }, { merge: true });
    }
    return { ok: true, kind: plan.kind, oldKept: Boolean(plan.keepOld), member: { id: input.memberId, ...before, ...plan.updates } };
  });
}
