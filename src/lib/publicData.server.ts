import "server-only";

import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { findEventDoc, normalizeEvent, queryEvents } from "./events";
import type { EventRecord } from "./events.shared";
import { getAdminDb } from "./firebaseAdmin";
import { orgDonationsStatsDocPath, orgMinutesCollectionPath } from "./firestorePaths";
import { toPlainJson } from "./json";
import { getArchiveEntry as readArchiveEntry, listArchive as readArchive } from "./minutesArchive.server";
import type { ArchiveEntry } from "./minutesArchive";
import { publicView } from "./minutesRecords";
import type { MeetingMinutesRecord } from "./minutes";
import { PUBLIC_CACHE_TAGS, publicCached } from "./publicCache.server";
import { toPlain } from "./serialize.server";

/**
 * Public data for the server-rendered pages, read from Firestore directly (no hop through the site's own
 * API) and kept in the shared cache for a few minutes. Each loader returns null when the data can't be
 * read right now, so a page can say so instead of failing; a failed read is never cached.
 */

async function orNull<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`Public read failed: ${label}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ---- Events ----

const cachedPublishedEvents = publicCached(
  async (): Promise<EventRecord[]> => (await queryEvents({ status: "published" })).map(event => toPlain(event) as EventRecord),
  "published-events",
  [PUBLIC_CACHE_TAGS.events]
);

/** Every published event, soonest first, with dates as epoch milliseconds. */
export function getPublishedEvents(): Promise<EventRecord[] | null> {
  return orNull("published events", cachedPublishedEvents);
}

const cachedPublishedEvent = publicCached(
  async (eventId: string): Promise<EventRecord | null> => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) return null;
    const snap = await findEventDoc(getAdminDb(), eventId);
    if (!snap) return null;
    const event = normalizeEvent(snap);
    return event.status === "published" ? (toPlain(event) as EventRecord) : null;
  },
  "published-event",
  [PUBLIC_CACHE_TAGS.events]
);

/** One published event: null when it doesn't exist or isn't published, undefined when it can't be read. */
export async function getPublishedEvent(eventId: string): Promise<EventRecord | null | undefined> {
  try {
    return await cachedPublishedEvent(eventId);
  } catch (error) {
    console.error("Public read failed: published event", error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

const cachedApprovedMinutesForEvent = publicCached(
  async (eventId: string): Promise<MeetingMinutesRecord | null> => {
    const snap = await getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).where("eventId", "==", eventId).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as Record<string, unknown>;
    if (data.status !== "approved") return null;
    return toPlain(publicView({ id: doc.id, ...data })) as MeetingMinutesRecord;
  },
  "event-approved-minutes",
  [PUBLIC_CACHE_TAGS.minutes]
);

/** The approved minutes of an event, as the public sees them (null when there are none yet). */
export async function getApprovedMinutesForEvent(eventId: string): Promise<MeetingMinutesRecord | null> {
  return (await orNull("event minutes", () => cachedApprovedMinutesForEvent(eventId))) ?? null;
}

// ---- Donations ----

export type DonationStats = {
  totalRaised: number;
  goal: number | null;
  donorCount: number | null;
  endAt: number | string | null;
  lastUpdatedAt: number | string | null;
};

/** The campaign totals, uncached: the API route and the admin pages use this. */
export async function readDonationStats(): Promise<DonationStats> {
  const db = getAdminDb();
  const snap = await db.doc(orgDonationsStatsDocPath(COMMUNITY_SLUG)).get();
  const fallbackSnap = snap.exists ? null : await db.doc(`community/${COMMUNITY_ID}/donations/stats`).get();
  const data = snap.exists ? snap.data() || {} : fallbackSnap?.exists ? fallbackSnap.data() || {} : {};
  return toPlainJson({
    totalRaised: data.totalRaised ?? 0,
    goal: data.goal ?? null,
    donorCount: typeof data.donorCount === "number" ? data.donorCount : null,
    endAt: data.endAt ?? null,
    lastUpdatedAt: data.lastUpdatedAt ?? null
  }) as DonationStats;
}

const cachedDonationStats = publicCached(readDonationStats, "donation-stats", [PUBLIC_CACHE_TAGS.donations]);

/** The campaign totals for public pages, cached; null when they can't be read. */
export function getDonationStats(): Promise<DonationStats | null> {
  return orNull("donation stats", cachedDonationStats);
}

// ---- Minutes archive ----

const cachedArchive = publicCached(readArchive, "minutes-archive", [PUBLIC_CACHE_TAGS.minutes]);
const cachedArchiveEntry = publicCached(readArchiveEntry, "minutes-archive-entry", [PUBLIC_CACHE_TAGS.minutes]);

/** Approved minutes for the public archive, newest meeting first; null when they can't be read. */
export function listArchive(): Promise<ArchiveEntry[] | null> {
  return orNull("minutes archive", cachedArchive);
}

/** One approved record for the public archive, or null. */
export function getArchiveEntry(id: string): Promise<ArchiveEntry | null> {
  return cachedArchiveEntry(id);
}
