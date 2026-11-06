import "server-only";

import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import {
  orgBroadcastsCollectionPath,
  orgEmailSuppressionsCollectionPath,
  orgEventTaskRemindersCollectionPath,
  orgEventTasksCollectionPath,
  orgGroupsCollectionPath,
  orgMembersCollectionPath,
  orgPositionTermsCollectionPath
} from "./firestorePaths";
import { fail, type Failure } from "./adminRoute.server";
import { EMPTY_COUNTS, confirmationMatches, suppressionToKeep, type DeletionCounts, type SuppressionReason } from "./memberDeletion";
import { serverEncryptionKeys } from "./signatureEncryption";

/**
 * Deleting a member (plan §20, Phase 15). Server-only. The steps run in a fixed order with the member document last,
 * and every step is safe to repeat, so a deletion that stops part way is finished by running it again (D45).
 */
const db = () => getAdminDb();
const orgPath = `organizations/${COMMUNITY_SLUG}`;
const membersCol = () => db().collection(orgMembersCollectionPath(COMMUNITY_SLUG));
const memberRef = (id: string) => membersCol().doc(id);
const campaignsCol = () => db().collection(`${orgPath}/callCampaigns`);
const assignmentRef = (id: string) => db().doc(`${orgPath}/callingTree/current/assignments/${id}`);
const broadcastsCol = () => db().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG));
const remindersCol = () => db().collection(orgEventTaskRemindersCollectionPath(COMMUNITY_SLUG));
const tasksCol = () => db().collection(orgEventTasksCollectionPath(COMMUNITY_SLUG));
const groupsCol = () => db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG));
const termsCol = () => db().collection(orgPositionTermsCollectionPath(COMMUNITY_SLUG));
const suppressionsCol = () => db().collection(orgEmailSuppressionsCollectionPath(COMMUNITY_SLUG));

const BATCH = 400;

// ---- do-not-email records (D44) ----------------------------------------------------------------------------------

/**
 * The record's id: a keyed hash of the address, so the collection holds no address and an outsider who reads it can't
 * test guesses. Looked up with every current and previous key, so rotating the key does not lose a record.
 */
const suppressionIds = (emailLower: string) => serverEncryptionKeys().map(key => crypto.createHmac("sha256", key).update(`email-suppression:v1:${emailLower}`).digest("hex"));

export type SuppressionRecord = { reason: SuppressionReason; at: Date };

/** The do-not-email records for these addresses, by address. Used when a member is added or imported. */
export async function suppressionsFor(emailLowers: string[]): Promise<Map<string, SuppressionRecord>> {
  const found = new Map<string, SuppressionRecord>();
  const unique = [...new Set(emailLowers.filter(email => email.includes("@")))];
  const lookups = unique.flatMap(email => suppressionIds(email).map(id => ({ email, ref: suppressionsCol().doc(id) })));
  for (let i = 0; i < lookups.length; i += 100) {
    const slice = lookups.slice(i, i + 100);
    const snaps = await db().getAll(...slice.map(item => item.ref));
    snaps.forEach((snap, index) => {
      if (!snap.exists || found.has(slice[index].email)) return;
      const at = snap.get("at") as { toDate?: () => Date } | Date | undefined;
      found.set(slice[index].email, { reason: snap.get("reason") === "bounced" ? "bounced" : "opted_out", at: at instanceof Date ? at : (at?.toDate?.() ?? new Date()) });
    });
  }
  return found;
}

async function keepSuppression(emailLower: string, reason: SuppressionReason, at: Date) {
  const [id] = suppressionIds(emailLower);
  await suppressionsCol().doc(id).set({ reason, at }, { merge: true });
}

/** When they opted out, if the record says so, otherwise now (a bounce has no earlier time of its own). */
const optOutTime = (value: unknown, fallback: Date): Date => (value instanceof Date ? value : ((value as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? fallback));

// ---- counting and deleting -----------------------------------------------------------------------------------

async function ids(query: FirebaseFirestore.Query | FirebaseFirestore.CollectionReference): Promise<string[]> {
  return (await query.select().get()).docs.map(doc => doc.id);
}

async function existing(refs: FirebaseFirestore.DocumentReference[]): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) out.push(...(await db().getAll(...refs.slice(i, i + 100))).filter(snap => snap.exists));
  return out;
}

/** Everything that points at this member, found once and used by both the preview and the deletion. */
async function findLinks(memberId: string) {
  const [noteIds, campaignIds, broadcastIds, reminderIds, taskIds, ledIds, termIds, assignment] = await Promise.all([
    ids(memberRef(memberId).collection("notes")),
    ids(campaignsCol()),
    ids(broadcastsCol()),
    ids(remindersCol().where("memberId", "==", memberId)),
    ids(tasksCol().where("memberIds", "array-contains", memberId)),
    ids(groupsCol().where("leadMemberId", "==", memberId)),
    ids(termsCol().where("memberId", "==", memberId)),
    assignmentRef(memberId).get()
  ]);
  const callRows = await existing(campaignIds.map(id => campaignsCol().doc(id).collection("calls").doc(memberId)));
  const deliveries = await existing(broadcastIds.map(id => broadcastsCol().doc(id).collection("deliveries").doc(memberId)));
  return { noteIds, callRows, deliveries, reminderIds, taskIds, ledIds, termIds, hasAssignment: assignment.exists };
}

type Links = Awaited<ReturnType<typeof findLinks>>;

function countsOf(links: Links, member: FirebaseFirestore.DocumentSnapshot): DeletionCounts {
  const groupIds = member.get("groupIds");
  return {
    ...EMPTY_COUNTS,
    notes: links.noteIds.length,
    assignment: links.hasAssignment ? 1 : 0,
    callRows: links.callRows.length,
    callAttempts: links.callRows.reduce((sum, snap) => sum + (Array.isArray(snap.get("attempts")) ? (snap.get("attempts") as unknown[]).length : 0), 0),
    deliveries: links.deliveries.length,
    reminders: links.reminderIds.length,
    tasks: links.taskIds.length,
    groupsLed: links.ledIds.length,
    groups: Array.isArray(groupIds) ? groupIds.length : 0,
    officerTerms: links.termIds.length
  };
}

export type MemberForDeletion = { id: string; name: string | null; emailLower: string };

/** What a deletion would remove and keep, for the preview. Reads only. */
export async function previewMemberDeletion(memberId: string): Promise<{ ok: true; member: MemberForDeletion; counts: DeletionCounts } | Failure> {
  const snap = await memberRef(memberId).get();
  if (!snap.exists) return fail(404, "That person isn't on the member list.");
  const links = await findLinks(memberId);
  return { ok: true, member: { id: memberId, name: (snap.get("name") as string | undefined) ?? null, emailLower: (snap.get("emailLower") as string | undefined) ?? "" }, counts: countsOf(links, snap) };
}

async function deleteRefs(refs: FirebaseFirestore.DocumentReference[]) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db().batch();
    for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

export type DeletionResult = { counts: DeletionCounts; suppressionKept: SuppressionReason | null };

/**
 * Deletes the member and what points at them. `confirm` must be the member's name (or email). The caller records the
 * audit entry from the returned counts, after this has done everything except the final delete (`finish`), so a failed
 * audit write leaves the member in place and the deletion can simply be run again.
 */
export async function deleteMember(input: { memberId: string; confirm: unknown; now: Date }): Promise<
  { ok: true; result: DeletionResult; finish: () => Promise<void> } | Failure
> {
  const { memberId, now } = input;
  const snap = await memberRef(memberId).get();
  if (!snap.exists) return fail(404, "That person isn't on the member list.");
  const member = { name: (snap.get("name") as string | undefined) ?? null, emailLower: (snap.get("emailLower") as string | undefined) ?? "" };
  if (!confirmationMatches(input.confirm, member)) return fail(400, "The name you typed doesn't match. Type it exactly as shown to confirm.");

  const links = await findLinks(memberId);
  const counts = countsOf(links, snap);
  const reason = suppressionToKeep({ emailLower: member.emailLower, emailOptOutAt: snap.get("emailOptOutAt"), emailBounced: snap.get("emailBounced") });

  // 1. The do-not-email record first, so the address can never be left unprotected by a later failure.
  if (reason) await keepSuppression(member.emailLower, reason, reason === "opted_out" ? optOutTime(snap.get("emailOptOutAt"), now) : now);
  // 2. What points at the member, in any order; each step can be repeated.
  await deleteRefs(links.noteIds.map(id => memberRef(memberId).collection("notes").doc(id)));
  await deleteRefs([assignmentRef(memberId)]);
  await deleteRefs(links.callRows.map(row => row.ref));
  await deleteRefs(links.deliveries.map(row => row.ref));
  await deleteRefs(links.reminderIds.map(id => remindersCol().doc(id)));
  for (let i = 0; i < links.taskIds.length; i += BATCH) {
    const batch = db().batch();
    for (const id of links.taskIds.slice(i, i + BATCH)) batch.update(tasksCol().doc(id), { memberIds: FieldValue.arrayRemove(memberId), updatedAt: now });
    await batch.commit();
  }
  for (let i = 0; i < links.ledIds.length; i += BATCH) {
    const batch = db().batch();
    for (const id of links.ledIds.slice(i, i + BATCH)) batch.update(groupsCol().doc(id), { leadMemberId: null, updatedAt: now });
    await batch.commit();
  }
  // 3. The member document goes last (D45); the caller writes the audit entry before calling this.
  return { ok: true, result: { counts, suppressionKept: reason }, finish: () => memberRef(memberId).delete().then(() => undefined) };
}
