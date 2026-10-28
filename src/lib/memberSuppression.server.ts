import "server-only";
import { COMMUNITY_SLUG } from "./community";
import { logAuditEvent } from "./audit";
import { getAdminDb } from "./firebaseAdmin";
import { orgMembersCollectionPath } from "./firestorePaths";
import { normalizeMemberEmail } from "./members";
import { serverEncryptionKeys } from "./signatureEncryption";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribeToken";

/** Why a member stopped receiving email. Recorded in the audit log. */
export type SuppressionReason = "unsubscribe_link" | "spam_complaint" | "bounce";

type Meta = { ip?: string | null; userAgent?: string | null; route: string };

export const memberUnsubscribeToken = (memberId: string) => signUnsubscribeToken(memberId, serverEncryptionKeys());
export const memberIdFromToken = (token: unknown) => verifyUnsubscribeToken(token, serverEncryptionKeys());

async function audit(action: string, memberId: string, reason: SuppressionReason, meta: Meta) {
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action,
    resource: { type: "member", id: memberId, path: `${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}` },
    after: { reason },
    meta: { ip: meta.ip ?? undefined, userAgent: meta.userAgent ?? null, route: meta.route }
  });
}

/** Opts a member out. Idempotent: an existing opt-out keeps its original time. Returns false if no such member. */
export async function optOutMember(memberId: string, reason: SuppressionReason, meta: Meta): Promise<boolean> {
  const ref = getAdminDb().doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  if (!snap.get("emailOptOutAt")) {
    const now = new Date();
    await ref.set({ emailOptOutAt: now, updatedAt: now }, { merge: true });
    await audit("member_email_opt_out", memberId, reason, meta);
  }
  return true;
}

/** Looks a member up by address and applies a suppression. Unknown addresses are ignored. */
export async function suppressByEmail(email: string, reason: Exclude<SuppressionReason, "unsubscribe_link">, meta: Meta): Promise<number> {
  const emailLower = normalizeMemberEmail(email);
  if (!emailLower) return 0;
  const snap = await getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).where("emailLower", "==", emailLower).get();
  let changed = 0;
  for (const doc of snap.docs) {
    if (reason === "spam_complaint") {
      if (await optOutMember(doc.id, reason, meta)) changed += 1;
    } else if (doc.get("emailBounced") !== true) {
      const now = new Date();
      await doc.ref.set({ emailBounced: true, updatedAt: now }, { merge: true });
      await audit("member_email_bounced", doc.id, reason, meta);
      changed += 1;
    }
  }
  return changed;
}
