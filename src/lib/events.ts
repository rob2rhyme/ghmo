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

/** What visitors may see of an event: no creator uid, no internal flyer settings. */
export function toPublicEvent(event: EventRecord): EventRecord {
  const { id, title, summary, body, status, startsAt, endsAt, timezone, location, featured } = event;
  return { id, title, summary, body, status, startsAt, endsAt, timezone, location, featured };
}

/**
 * What an event card (Events list, Home "Next events", calendar grid) needs: no `body` or `status`, which only the
 * event page shows. Keeps the cached list pages' payload small (R4 P7). Type-only imports are fine from client code.
 */
export type EventCardRecord = Pick<EventRecord, "id" | "title" | "summary" | "startsAt" | "endsAt" | "timezone" | "location" | "featured">;

/** The card shape of a public event: drops everything the cards don't show. */
export function toEventCard(event: EventRecord): EventCardRecord {
  const { id, title, summary, startsAt, endsAt, timezone, location, featured } = event;
  return { id, title, summary, startsAt, endsAt, timezone, location, featured };
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

/** The events query could not run because Firestore needs a composite index (production only). */
export class EventsIndexMissingError extends Error {
  constructor() {
    super("Firestore composite index required for events query.");
    this.name = "EventsIndexMissingError";
  }
}

function startMillis(value: unknown): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const raw = typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate() : value;
  const ts = new Date(raw as string | number | Date).getTime();
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

/**
 * Events from every location, soonest first: `status` null means every status. Used by the events API
 * and the public pages. Throws EventsIndexMissingError when production lacks the composite index;
 * elsewhere a missing index falls back to an unordered query sorted in memory.
 */
export async function queryEvents({
  status,
  rangeStart,
  rangeEnd,
  last
}: {
  status: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Keep the latest `last` events of the range (soonest-first order), instead of the earliest 200. */
  last?: number;
}): Promise<EventRecord[]> {
  const { getAdminDb } = await import("./firebaseAdmin");
  const db = getAdminDb();
  const build = (collection: FirebaseFirestore.Query, withOrderBy: boolean) => {
    let q = collection;
    if (status) q = q.where("status", "==", status);
    if (rangeStart) q = q.where("startsAt", ">=", new Date(rangeStart));
    if (rangeEnd) q = q.where("startsAt", "<=", new Date(rangeEnd));
    if (withOrderBy) {
      q = q.orderBy("startsAt", "asc");
      // limitToLast keeps the newest ones with the same (status, startsAt) index as the ascending query.
      return last ? q.limitToLast(last) : q.limit(200);
    }
    return q.limit(last ?? 200);
  };
  const sorted = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
    docs.map(normalizeEvent).sort((a, b) => startMillis(a.startsAt) - startMillis(b.startsAt));

  try {
    return sorted(await queryAllEvents(db, collection => build(collection, true)));
  } catch (err) {
    const error = err as { code?: unknown; message?: unknown };
    const message = error?.message ? String(error.message) : "";
    const missingIndex = error?.code === 9 || message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
    if (!missingIndex) throw err;
    if (process.env.NODE_ENV === "production") throw new EventsIndexMissingError();
    return sorted(await queryAllEvents(db, collection => build(collection, false)));
  }
}

/** Published events for public views (calendar feeds), from every events location. */
export async function listPublishedEvents(): Promise<EventRecord[]> {
  const { getAdminDb } = await import("./firebaseAdmin");
  const docs = await queryAllEvents(getAdminDb(), q => q.where("status", "==", "published").limit(200));
  return docs.map(normalizeEvent);
}
