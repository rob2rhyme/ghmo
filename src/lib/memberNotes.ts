import type { RecordLocation } from "./e2ee/envelope";

/**
 * Pure rules for the notes log on a member's profile (plan §17, 13-B). A note is one small record whose text is
 * end-to-end encrypted in the admin's browser; who wrote it and when are plain fields, so the order and authorship
 * show without decrypting. Notes are append-only: they can be added and deleted, never edited.
 */

export const NOTE_MAX = 2000;
/** A member can have this many notes; it keeps a profile readable and a page load small. */
export const MAX_NOTES_PER_MEMBER = 200;

export const MEMBER_NOTES_PATH = "organizations/ghmo/members";
/** The location a note's envelope is bound to: member and note, so a note can't be moved to another member. */
export const memberNoteLoc = (memberId: string, noteId: string): RecordLocation => ({ path: MEMBER_NOTES_PATH, docId: `${memberId}/notes/${noteId}` });

/** What is encrypted inside a note. */
export type NotePayload = { text: string };

/** Trims a note and normalizes line breaks; "" when there is nothing to save. Over-long text is refused by the caller, not cut. */
export const cleanNoteText = (value: unknown): string => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "");

export function checkNoteText(value: unknown): string | null {
  const text = cleanNoteText(value);
  if (!text) return "Write something to save.";
  if (text.length > NOTE_MAX) return `A note can be at most ${NOTE_MAX} characters. This one is ${text.length}.`;
  return null;
}

export type NoteMeta = { id: string; authorUid: string; authorName: string; createdAt: number | null };

/** Only the note's author, or a super admin, may delete it. */
export const canDeleteNote = (note: Pick<NoteMeta, "authorUid">, actor: { uid: string; superAdmin: boolean }): boolean => actor.superAdmin || note.authorUid === actor.uid;

/** Newest first; notes without a time go last, ties keep a stable order by id. */
export function sortNotesNewestFirst<T extends Pick<NoteMeta, "id" | "createdAt">>(notes: T[]): T[] {
  return [...notes].sort((a, b) => (b.createdAt ?? -1) - (a.createdAt ?? -1) || a.id.localeCompare(b.id));
}
