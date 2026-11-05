import "server-only";

import { selectRecipients } from "./broadcast";
import { broadcastProgress, sendingBlocker } from "./broadcastSender.server";
import { sendingConfigFromEnv } from "./broadcastSending";
import { COMMUNITY_SLUG } from "./community";
import { normalizeEvent, queryAllEvents } from "./events";
import { getAdminDb } from "./firebaseAdmin";
import {
  orgAuditLogsCollectionPath,
  orgBroadcastsCollectionPath,
  orgDonationsStatsDocPath,
  orgDonationsWebhookEventsCollectionPath,
  orgMembersCollectionPath,
  orgMinutesCollectionPath
} from "./firestorePaths";
import { toPlainJson } from "./json";
import { isMailConfigured } from "./mailer.server";
import type { AdminActor } from "./admin";
import { adminView } from "./minutesRecords";
import { toPlain } from "./serialize.server";

/**
 * Admin reads shared by the API routes (for the browser) and the admin server pages, so a page reads
 * Firestore directly instead of calling its own API: one function run and one session check per view.
 * Every result is JSON-safe, exactly what the API sends.
 *
 * Each read takes the caller's admin check (the result of requireActiveAdmin or enforceActiveAdmin) as its
 * first argument, so a caller can't forget the check: without it the code doesn't compile. In a server
 * page, `await requireActiveAdmin()` again is free (memoized per render).
 */
export type AdminCheck = { actor: AdminActor };

type JsonRecord = Record<string, unknown>;

/** What JSON.stringify would send: the routes answer with NextResponse.json, so pages get the same shapes. */
function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---- Dashboard ----

/** The dashboard's "Recent minutes": how many rows, and the only fields a row shows. */
const DASHBOARD_RECENT_MINUTES = 5;
const DASHBOARD_MINUTES_FIELDS = ["eventTitle", "eventDate", "meetingType", "status"] as const;

export async function loadAdminDashboard(_check: AdminCheck) {
  const db = getAdminDb();
  const warnings: string[] = [];
  // The browser gets only which part failed; the error text stays in the server log.
  const note = (label: string, err: unknown) => {
    console.error(`Dashboard read failed: ${label}`, err instanceof Error ? err.message : String(err));
    warnings.push(label);
  };

  const minutesCollection = db.collection(orgMinutesCollectionPath(COMMUNITY_SLUG));
  // Only what the dashboard shows: the five latest records' list fields (no content or ciphertext) and two counts.
  const countStatus = (status: string) =>
    minutesCollection
      .where("status", "==", status)
      .count()
      .get()
      .then(snap => snap.data().count);

  const [stats, webhookEvents, auditLogs, minutes, minutesCounts] = await Promise.all([
    db
      .doc(orgDonationsStatsDocPath(COMMUNITY_SLUG))
      .get()
      .then(snap => (snap.exists ? snap.data() || null : null))
      .catch(err => (note("stats", err), null)),
    db
      .collection(orgDonationsWebhookEventsCollectionPath(COMMUNITY_SLUG))
      .orderBy("receivedAt", "desc")
      .limit(5)
      .get()
      .then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      .catch(err => (note("webhookEvents", err), [] as unknown[])),
    db
      .collection(orgAuditLogsCollectionPath(COMMUNITY_SLUG))
      .orderBy("createdAt", "desc")
      .limit(10)
      .get()
      .then(snap =>
        snap.docs.map(doc => {
          const data = doc.data() as Record<string, unknown>;
          const ts = (data.createdAt || data.timestamp) as { toMillis?: () => number } | Date | number | undefined;
          const createdAtMs =
            ts instanceof Date ? ts.getTime() : typeof ts === "number" ? ts : typeof ts?.toMillis === "function" ? ts.toMillis() : null;
          return toPlain({ id: doc.id, ...data, createdAtMs });
        })
      )
      .catch(err => (note("auditLogs", err), [] as unknown[])),
    minutesCollection
      .orderBy("eventDate", "desc")
      .limit(DASHBOARD_RECENT_MINUTES)
      .select(...DASHBOARD_MINUTES_FIELDS)
      .get()
      .then(snap => snap.docs.map(doc => toPlain({ id: doc.id, ...doc.data() })))
      .catch(err => (note("minutes", err), [] as unknown[])),
    Promise.all([countStatus("submitted"), countStatus("draft")])
      .then(([submitted, draft]) => ({ submitted, draft }))
      .catch(err => (note("minutesCounts", err), { submitted: 0, draft: 0 }))
  ]);

  return asJson(
    toPlain({
      ok: true,
      stats: stats ?? { totalRaised: 0, goal: 0, donorCount: 0 },
      webhookEvents,
      auditLogs,
      minutes,
      minutesCounts,
      warnings
    })
  ) as {
    ok: true;
    stats: JsonRecord;
    webhookEvents: JsonRecord[];
    auditLogs: JsonRecord[];
    minutes: JsonRecord[];
    minutesCounts: { submitted: number; draft: number };
    warnings: string[];
  };
}

// ---- Events ----

/** Every event in every status, newest first (the admin Events page). */
export async function listAdminEvents(_check: AdminCheck) {
  const docs = await queryAllEvents(getAdminDb(), q => q.orderBy("startsAt", "desc").limit(200));
  return asJson(toPlainJson(docs.map(normalizeEvent))) as JsonRecord[];
}

// ---- Members ----

export async function listMembers(_check: AdminCheck) {
  const snapshot = await getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).orderBy("emailLower").get();
  return asJson(snapshot.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }))) as JsonRecord[];
}

/** One member for the profile page (plaintext fields and the encrypted envelope as stored), or null when there is none. */
export async function getMember(_check: AdminCheck, memberId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) return null;
  const snap = await getAdminDb().doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${memberId}`).get();
  return snap.exists ? (asJson(toPlain({ id: snap.id, ...snap.data() })) as JsonRecord) : null;
}

// ---- Minutes ----

/** The admin view of minutes records, newest meeting first; `eventId` narrows to one event. */
export async function listAdminMinutes(_check: AdminCheck, { eventId }: { eventId?: string | null } = {}) {
  let query: FirebaseFirestore.Query = getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG));
  if (eventId) query = query.where("eventId", "==", eventId);
  const snap = await query.orderBy("eventDate", "desc").limit(100).get();
  return asJson(snap.docs.map(doc => toPlain(adminView({ id: doc.id, ...doc.data() })))) as JsonRecord[];
}

// ---- Broadcasts ----

export async function listBroadcasts(_check: AdminCheck) {
  const snap = await getAdminDb().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG)).orderBy("updatedAt", "desc").limit(100).get();
  return asJson(snap.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }))) as JsonRecord[];
}

const BROADCAST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A broadcast document, or null for a bad or unknown id. */
export async function loadBroadcastDoc(_check: AdminCheck, broadcastId: string) {
  if (!BROADCAST_ID.test(broadcastId)) return null;
  const ref = getAdminDb().doc(`${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${broadcastId}`);
  const snap = await ref.get();
  return snap.exists ? { ref, data: snap.data() as Record<string, unknown> } : null;
}

/** How many members a broadcast would reach now. */
export async function broadcastRecipientCount(_check: AdminCheck): Promise<number> {
  const snap = await getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).get();
  return selectRecipients(snap.docs.map(doc => doc.data() as Parameters<typeof selectRecipients>[0][number])).length;
}

/** Everything the broadcast detail page shows, or null when the broadcast doesn't exist. */
export async function loadBroadcastDetail(check: AdminCheck, broadcastId: string) {
  const found = await loadBroadcastDoc(check, broadcastId);
  if (!found) return null;
  const sendingState = found.data.status === "sending" || found.data.status === "sent";
  const [recipientCount, progress] = await Promise.all([
    broadcastRecipientCount(check),
    sendingState ? broadcastProgress(found.ref) : Promise.resolve(null)
  ]);
  return asJson({
    broadcast: toPlain({ id: found.ref.id, ...found.data }),
    recipientCount,
    progress,
    sendingBlocker: sendingBlocker(sendingConfigFromEnv(), isMailConfigured())
  });
}
