import "server-only";

import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { DEFAULT_TIMEZONE, type EventRecord } from "./events.shared";
import { orgDocPath } from "./firestorePaths";

export function eventsCollectionPath(orgId?: string) {
  const slug = orgId || COMMUNITY_SLUG;
  return `${orgDocPath(slug)}/events`;
}

export function normalizeEvent(doc: FirebaseFirestore.DocumentSnapshot): EventRecord {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || "Untitled Event",
    summary: data.summary,
    body: data.body || "",
    status: data.status || "draft",
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    timezone: data.timezone || DEFAULT_TIMEZONE,
    location: data.location,
    featured: data.featured,
    announcementDocTemplate: data.announcementDocTemplate,
    announcementPdfSource: data.announcementPdfSource,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUid: data.createdByUid
  };
}

export function ensureOrgSlug(slug: string) {
  return slug === COMMUNITY_SLUG;
}

export { DEFAULT_TIMEZONE };

/**
 * Every place events have been stored. New events go to the first; older ones may sit in the others
 * (admin saves used `organizations/ghmo-site/events` until 2026-11). Reads look in all of them, and
 * edits and deletes act on the event wherever it is, so nothing is hidden or lost.
 */
export function eventCollectionPaths(): string[] {
  return [eventsCollectionPath(COMMUNITY_SLUG), eventsCollectionPath(COMMUNITY_ID), `community/${COMMUNITY_ID}/events`];
}

/** Where new events are created. */
export function primaryEventsPath(): string {
  return eventCollectionPaths()[0];
}

/** The stored event with this id, from whichever location holds it (first match wins), or null. */
export async function findEventDoc(db: FirebaseFirestore.Firestore, eventId: string): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  for (const path of eventCollectionPaths()) {
    const snap = await db.collection(path).doc(eventId).get();
    if (snap.exists) return snap;
  }
  return null;
}

/**
 * Runs the same query on every events location and merges the results, keeping the first copy of
 * an id. `build` adds filters, ordering and limits to each collection query.
 */
export async function queryAllEvents(
  db: FirebaseFirestore.Firestore,
  build: (collection: FirebaseFirestore.Query) => FirebaseFirestore.Query = q => q
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snaps = await Promise.all(eventCollectionPaths().map(path => build(db.collection(path)).get()));
  const seen = new Set<string>();
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      docs.push(doc);
    }
  }
  return docs;
}

/** Published events for public views (calendar feeds), from every events location. */
export async function listPublishedEvents(): Promise<EventRecord[]> {
  const { getAdminDb } = await import("./firebaseAdmin");
  const docs = await queryAllEvents(getAdminDb(), q => q.where("status", "==", "published").limit(200));
  return docs.map(normalizeEvent);
}
