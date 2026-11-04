import "server-only";

import { unstable_rethrow } from "next/navigation";

import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { findEventDoc, normalizeEvent, queryAllEvents, queryEvents, toEventCard, toPublicEvent, type EventCardRecord } from "./events";
import type { EventRecord } from "./events.shared";
import { getAdminDb } from "./firebaseAdmin";
import { orgDonationsStatsDocPath, orgMinutesCollectionPath } from "./firestorePaths";
import { toPlainJson } from "./json";
import { getArchiveEntry as readArchiveEntry, listArchive as readArchive } from "./minutesArchive.server";
import type { ArchiveEntry } from "./minutesArchive";
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
    // Next signals "render this page per request" (and redirects, 404s) by throwing; let those through.
    unstable_rethrow(error);
    console.error(`Public read failed: ${label}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// ---- Events ----

const cachedPublishedEvents = publicCached(
  async (): Promise<EventRecord[]> => {
    // Upcoming and past separately, so neither crowds out the other as the list grows: every upcoming event
    // (up to 200), and the 100 most recent past ones. Same index as before (status, startsAt).
    const now = new Date().toISOString();
    const [upcoming, past, undated] = await Promise.all([
      queryEvents({ status: "published", rangeStart: now }),
      queryEvents({ status: "published", rangeEnd: now, last: 100 }),
      // Events saved without a date ("to be announced"): range filters skip them, so ask for them by name.
      queryAllEvents(getAdminDb(), q => q.where("status", "==", "published").where("startsAt", "==", null).limit(50)).then(docs =>
        docs.map(normalizeEvent)
      )
    ]);
    const seen = new Set<string>();
    return [...past, ...upcoming, ...undated]
      .filter(event => (seen.has(event.id) ? false : (seen.add(event.id), true)))
      .map(event => toPlain(toPublicEvent(event)) as EventRecord);
  },
  "published-events",
  [PUBLIC_CACHE_TAGS.events]
);

/** Every published event, soonest first, with dates as epoch milliseconds. */
export function getPublishedEvents(): Promise<EventRecord[] | null> {
  return orNull("published events", cachedPublishedEvents);
}

/**
 * Every published event as a card (no body or status), soonest first: what the Events list and Home send to the
 * browser. Same cached read as getPublishedEvents; the calendar feed and the events API use the full records.
 */
export async function getPublishedEventCards(): Promise<EventCardRecord[] | null> {
  const events = await getPublishedEvents();
  return events ? events.map(toEventCard) : null;
}

/** Firestore document ids as the app creates them; anything else is answered "not found" before any read or cache entry. */
const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

const cachedPublishedEvent = publicCached(
  async (eventId: string): Promise<EventRecord | null> => {
    const snap = await findEventDoc(getAdminDb(), eventId);
    if (!snap) return null;
    const event = normalizeEvent(snap);
    return event.status === "published" ? (toPlain(toPublicEvent(event)) as EventRecord) : null;
  },
  "published-event",
  [PUBLIC_CACHE_TAGS.events]
);

/** One published event: null when it doesn't exist or isn't published, undefined when it can't be read. */
export async function getPublishedEvent(eventId: string): Promise<EventRecord | null | undefined> {
  if (!EVENT_ID.test(eventId)) return null;
  try {
    return await cachedPublishedEvent(eventId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Public read failed: published event", error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

const cachedApprovedMinutesId = publicCached(
  async (eventId: string): Promise<{ id: string } | null> => {
    const snap = await getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).where("eventId", "==", eventId).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    // Only the id is kept: the page links to the public archive, which shows what may be public.
    return doc.get("status") === "approved" ? { id: doc.id } : null;
  },
  "event-approved-minutes-id",
  [PUBLIC_CACHE_TAGS.minutes]
);

/**
 * The id of an event's approved minutes: null when there are none yet, undefined when they can't be read
 * (so a cached page can keep its last good copy instead of dropping the link).
 */
export async function getApprovedMinutesForEvent(eventId: string): Promise<{ id: string } | null | undefined> {
  if (!EVENT_ID.test(eventId)) return null;
  try {
    return await cachedApprovedMinutesId(eventId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Public read failed: event minutes", error instanceof Error ? error.message : String(error));
    return undefined;
  }
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
export async function getArchiveEntry(id: string): Promise<ArchiveEntry | null> {
  if (!EVENT_ID.test(id)) return null;
  return cachedArchiveEntry(id);
}
