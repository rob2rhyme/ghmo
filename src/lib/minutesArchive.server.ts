import "server-only";
import { getAdminDb } from "./firebaseAdmin";
import { orgMinutesCollectionPath } from "./firestorePaths";
import { COMMUNITY_SLUG } from "./community";
import { toArchiveEntry, type ArchiveEntry } from "./minutesArchive";

export async function listArchive(): Promise<ArchiveEntry[]> {
  const snap = await getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).where("status", "==", "approved").limit(300).get();
  return snap.docs
    .map(doc => toArchiveEntry({ id: doc.id, ...doc.data() }))
    .filter((entry): entry is ArchiveEntry => entry !== null)
    .sort((a, b) => (b.eventDate ?? 0) - (a.eventDate ?? 0));
}

export async function getArchiveEntry(id: string): Promise<ArchiveEntry | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const doc = await getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).doc(id).get();
  return doc.exists ? toArchiveEntry({ id: doc.id, ...doc.data() }) : null;
}
