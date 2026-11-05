import "server-only";

import { COMMUNITY_SLUG } from "./community";
import type { Failure } from "./adminRoute.server";
import { fail } from "./adminRoute.server";
import { toDate } from "./format";
import { getAdminDb } from "./firebaseAdmin";
import { orgMembersCollectionPath } from "./firestorePaths";
import { MAX_NOTES_PER_MEMBER, canDeleteNote, sortNotesNewestFirst, type NoteMeta } from "./memberNotes";

/**
 * Storage for the notes on a member's profile (plan §17, 13-B). Server-written only: the rules let admins read and
 * nobody write, so every add and delete is audited by its route. The text is an envelope the server cannot read.
 *
 *  organizations/ghmo/members/{memberId}/notes/{noteId}   enc, authorUid, authorName, createdAt
 */
const db = () => getAdminDb();
const memberRef = (memberId: string) => db().doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}`);
const notesCol = (memberId: string) => memberRef(memberId).collection("notes");

const ALREADY_EXISTS = 6;

export type StoredNote = NoteMeta & { enc: unknown };

/** The member's name for a log line, or null when there is no such member. */
export async function readMemberLabel(memberId: string): Promise<string | null> {
  const snap = await memberRef(memberId).get();
  if (!snap.exists) return null;
  return (snap.get("name") as string | null) || (snap.get("emailLower") as string | undefined) || "a member";
}

export async function listNotes(memberId: string): Promise<StoredNote[]> {
  const snap = await notesCol(memberId).get();
  return sortNotesNewestFirst(
    snap.docs.map(doc => ({
      id: doc.id,
      authorUid: (doc.get("authorUid") as string | undefined) ?? "",
      authorName: (doc.get("authorName") as string | undefined) ?? "",
      createdAt: toDate(doc.get("createdAt"))?.getTime() ?? null,
      enc: doc.get("enc")
    }))
  );
}

/** Adds a note. The id comes from the browser because the envelope is bound to it; an id that exists is refused. */
export async function addNote(input: { memberId: string; noteId: string; enc: unknown; authorUid: string; authorName: string; now: Date }): Promise<{ ok: true } | Failure> {
  const count = (await notesCol(input.memberId).count().get()).data().count;
  if (count >= MAX_NOTES_PER_MEMBER) return fail(409, `A member can have at most ${MAX_NOTES_PER_MEMBER} notes. Delete one you no longer need first.`);
  try {
    await notesCol(input.memberId).doc(input.noteId).create({ enc: input.enc, authorUid: input.authorUid, authorName: input.authorName, createdAt: input.now });
  } catch (error) {
    if ((error as { code?: number }).code === ALREADY_EXISTS) return fail(409, "This note was already saved.");
    throw error;
  }
  return { ok: true };
}

/** Deletes a note if the actor wrote it or is a super admin. */
export async function deleteNote(input: { memberId: string; noteId: string; actor: { uid: string; superAdmin: boolean } }): Promise<{ ok: true; note: NoteMeta } | Failure> {
  const ref = notesCol(input.memberId).doc(input.noteId);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That note doesn't exist.");
  const note: NoteMeta = {
    id: snap.id,
    authorUid: (snap.get("authorUid") as string | undefined) ?? "",
    authorName: (snap.get("authorName") as string | undefined) ?? "",
    createdAt: toDate(snap.get("createdAt"))?.getTime() ?? null
  };
  if (!canDeleteNote(note, input.actor)) return fail(403, "Only the person who wrote a note, or a super admin, can delete it.");
  await ref.delete();
  return { ok: true, note };
}
