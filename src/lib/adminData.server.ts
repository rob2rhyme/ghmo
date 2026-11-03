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
  orgHomeBlocksDocPath,
  orgMembersCollectionPath,
  orgMinutesCollectionPath
} from "./firestorePaths";
import { toPlainJson } from "./json";
import { isMailConfigured } from "./mailer.server";
import { adminView } from "./minutesRecords";
import { toPlain } from "./serialize.server";

/**
 * Admin reads shared by the API routes (for the browser) and the admin server pages, so a page reads
 * Firestore directly instead of calling its own API: one function run and one session check per view.
 * Callers check the admin session first. Every result is JSON-safe, exactly what the API sends.
 */

type JsonRecord = Record<string, unknown>;

/** What JSON.stringify would send: the routes answer with NextResponse.json, so pages get the same shapes. */
function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---- Dashboard ----

export async function loadAdminDashboard() {
  const db = getAdminDb();
  const warnings: string[] = [];
  const note = (label: string, err: unknown) => warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);

  const [stats, webhookEvents, auditLogs, blocks, minutes] = await Promise.all([
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
    db
      .doc(orgHomeBlocksDocPath(COMMUNITY_SLUG))
      .get()
      .then(snap => (snap.exists ? snap.data()?.blocks || [] : []))
      .catch(err => (note("blocks", err), [] as unknown[])),
    db
      .collection(orgMinutesCollectionPath(COMMUNITY_SLUG))
      .orderBy("eventDate", "desc")
      .limit(50)
      .get()
      .then(snap => snap.docs.map(doc => toPlain({ id: doc.id, ...doc.data() })))
      .catch(err => (note("minutes", err), [] as unknown[]))
  ]);

  return asJson(
    toPlain({
      ok: true,
      stats: stats ?? { totalRaised: 0, goal: 0, donorCount: 0 },
      webhookEvents,
      auditLogs,
      blocks,
      minutes,
      warnings
    })
  ) as {
    ok: true;
    stats: JsonRecord;
    webhookEvents: JsonRecord[];
    auditLogs: JsonRecord[];
    blocks: unknown[];
    minutes: JsonRecord[];
    warnings: string[];
  };
}

// ---- Events ----

/** Every event in every status, newest first (the admin Events page). */
export async function listAdminEvents() {
  const docs = await queryAllEvents(getAdminDb(), q => q.orderBy("startsAt", "desc").limit(200));
  return asJson(toPlainJson(docs.map(normalizeEvent))) as JsonRecord[];
}

// ---- Members ----

export async function listMembers() {
  const snapshot = await getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).orderBy("emailLower").get();
  return asJson(snapshot.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }))) as JsonRecord[];
}

// ---- Minutes ----

/** The admin view of minutes records, newest meeting first; `eventId` narrows to one event. */
export async function listAdminMinutes({ eventId }: { eventId?: string | null } = {}) {
  let query: FirebaseFirestore.Query = getAdminDb().collection(orgMinutesCollectionPath(COMMUNITY_SLUG));
  if (eventId) query = query.where("eventId", "==", eventId);
  const snap = await query.orderBy("eventDate", "desc").limit(100).get();
  return asJson(snap.docs.map(doc => toPlain(adminView({ id: doc.id, ...doc.data() })))) as JsonRecord[];
}

// ---- Broadcasts ----

export async function listBroadcasts() {
  const snap = await getAdminDb().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG)).orderBy("updatedAt", "desc").limit(100).get();
  return asJson(snap.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }))) as JsonRecord[];
}

const BROADCAST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A broadcast document, or null for a bad or unknown id. */
export async function loadBroadcastDoc(broadcastId: string) {
  if (!BROADCAST_ID.test(broadcastId)) return null;
  const ref = getAdminDb().doc(`${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${broadcastId}`);
  const snap = await ref.get();
  return snap.exists ? { ref, data: snap.data() as Record<string, unknown> } : null;
}

/** How many members a broadcast would reach now. */
export async function broadcastRecipientCount(): Promise<number> {
  const snap = await getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).get();
  return selectRecipients(snap.docs.map(doc => doc.data() as Parameters<typeof selectRecipients>[0][number])).length;
}

/** Everything the broadcast detail page shows, or null when the broadcast doesn't exist. */
export async function loadBroadcastDetail(broadcastId: string) {
  const found = await loadBroadcastDoc(broadcastId);
  if (!found) return null;
  const sendingState = found.data.status === "sending" || found.data.status === "sent";
  const [recipientCount, progress] = await Promise.all([
    broadcastRecipientCount(),
    sendingState ? broadcastProgress(found.ref) : Promise.resolve(null)
  ]);
  return asJson({
    broadcast: toPlain({ id: found.ref.id, ...found.data }),
    recipientCount,
    progress,
    sendingBlocker: sendingBlocker(sendingConfigFromEnv(), isMailConfigured())
  });
}
