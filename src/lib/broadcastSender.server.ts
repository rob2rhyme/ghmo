import "server-only";
import crypto from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { audienceKey, hashBroadcast, inAudience, normalizeBroadcastContent, selectRecipients, type BroadcastAudience } from "./broadcast";
import { footerFromEnv, unsubscribeHeaders, withUnsubscribeFooter } from "./broadcastMail";
import {
  MAX_ATTEMPTS,
  idempotencyKey,
  isStaleClaim,
  nextChunkSize,
  nextQuotaReset,
  quotaDay,
  type SendingConfig
} from "./broadcastSending";
import { COMMUNITY_SLUG } from "./community";
import { orgBroadcastsCollectionPath, orgDocPath, orgMembersCollectionPath } from "./firestorePaths";
import type { BatchMessage, BatchResult } from "./mailer.server";
import { memberEmailState } from "./members";
import { signUnsubscribeToken } from "./unsubscribeToken";

/**
 * Sends an approved broadcast in chunks (plan §10.3, 8-D). The admin's page calls `sendNextChunk`
 * repeatedly until it reports done; closing the page just pauses, and any admin can resume later.
 *
 * Safety properties:
 *  - Each member has one delivery row; a row is claimed in a transaction before sending, so two open
 *    pages never email the same person twice.
 *  - Each claim has an id that becomes the provider's idempotency key. If a server function dies after
 *    the provider accepted the emails but before the rows were marked sent, the abandoned claim is retried
 *    with the same key, and the provider returns the earlier result instead of sending again.
 *  - Today's quota is reserved inside the same transaction, so concurrent chunks can't overshoot it.
 *  - Every chunk re-checks the kill switch, the approved fingerprint, and each member's current consent,
 *    so an unsubscribe or a cancel takes effect immediately.
 */
export type SenderDeps = {
  db: Firestore;
  config: SendingConfig;
  origin: string;
  now: () => Date;
  serverKeys: Uint8Array[];
  sendBatch: (messages: BatchMessage[], idempotencyKey: string) => Promise<BatchResult>;
};

export type SendProgress = {
  status: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  done: boolean;
  paused?: { reason: "quota"; resumesAt: string };
};

type Outcome = { ok: true; progress: SendProgress } | { ok: false; status: number; error: string; code?: string };

const fail = (status: number, error: string, code?: string): Outcome => ({ ok: false, status, error, code });

const broadcastRef = (db: Firestore, id: string) => db.doc(`${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${id}`);
const quotaRef = (db: Firestore, day: string) => db.doc(`${orgDocPath(COMMUNITY_SLUG)}/broadcastQuota/${day}`);

/** Why sending can't happen right now, or null when everything needed is in place. */
export function sendingBlocker(config: SendingConfig, mailConfigured: boolean): string | null {
  if (!config.enabled) return "Sending is turned off on this site. Ask whoever manages the website to turn it on.";
  if (!mailConfigured) return "Email sending isn't set up on this site yet.";
  if (!footerFromEnv()) return "Every broadcast needs the organization's name and postal address in its footer. Ask whoever manages the website to add them.";
  if (config.dailyLimit <= 0) return "The daily sending limit is set to zero, so nothing can be sent. Ask whoever manages the website to raise it.";
  return null;
}

function approvedTextMatches(data: Record<string, unknown>): boolean {
  const normalized = normalizeBroadcastContent(data);
  return normalized.ok && typeof data.approvedHash === "string" && hashBroadcast(normalized.content) === data.approvedHash;
}

async function progressOf(ref: DocumentReference, extra: Partial<SendProgress> = {}): Promise<SendProgress> {
  const data = (await ref.get()).data() ?? {};
  const total = Number(data.total ?? 0);
  const sent = Number(data.sentCount ?? 0);
  const failed = Number(data.failedCount ?? 0);
  const skipped = Number(data.skippedCount ?? 0);
  const remaining = Math.max(0, total - sent - failed - skipped);
  return { status: String(data.status ?? ""), total, sent, failed, skipped, remaining, done: data.status === "sent", ...extra };
}

/**
 * Snapshots the recipients and moves an approved broadcast to "sending". `audience` is the audience the
 * recipients were chosen for: if the stored audience is different by the time the transaction runs, nothing starts.
 */
export async function startSending(
  deps: SenderDeps,
  broadcastId: string,
  recipients: { id: string }[],
  audience?: { audience: BroadcastAudience; groupName: string | null }
): Promise<Outcome> {
  const ref = broadcastRef(deps.db, broadcastId);
  if (recipients.length === 0) {
    return fail(400, audience?.audience.kind === "group" ? "Nobody in this group can be emailed: no one in it has agreed to email (or all opted out)." : "Nobody can be emailed: no member has agreed to email (or all opted out).");
  }
  if (recipients.length > deps.config.maxRecipients) {
    return fail(400, `This would go to ${recipients.length} members, more than this site allows in one broadcast (${deps.config.maxRecipients}). Ask whoever manages the website to raise the limit.`);
  }
  const now = deps.now();
  // Mark the broadcast first (in a transaction, so two clicks can't both start it), then add the rows.
  const started = await deps.db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail(404, "Broadcast not found");
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== "approved") return fail(409, "Only an approved broadcast can be sent.");
    if (!approvedTextMatches(data)) return fail(409, "The text no longer matches what was approved.", "CONTENT_CHANGED");
    const stored = normalizeBroadcastContent(data);
    if (audience && (!stored.ok || audienceKey(stored.content.audience) !== audienceKey(audience.audience))) {
      return fail(409, "Who this goes to changed. Reload the page.", "CONTENT_CHANGED");
    }
    tx.update(ref, {
      status: "sending",
      startedAt: now,
      total: recipients.length,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      // The group's name as it is now, for the footer line ("…you are in this group: …").
      ...(audience?.audience.kind === "group" ? { audienceGroupName: audience.groupName } : {}),
      updatedAt: now
    });
    return null;
  });
  if (started) return started;

  for (let i = 0; i < recipients.length; i += 400) {
    const batch = deps.db.batch();
    for (const member of recipients.slice(i, i + 400)) batch.set(ref.collection("deliveries").doc(member.id), { state: "pending", attempts: 0, createdAt: now });
    await batch.commit();
  }
  return { ok: true, progress: await progressOf(ref) };
}

type Claim = { claimId: string; memberIds: string[]; reserved: number; reclaimed: boolean };

/** Claims the next rows to send, reserving quota. Abandoned claims are retried first, with their original id. */
async function claimChunk(deps: SenderDeps, ref: DocumentReference, now: Date): Promise<Claim | { quotaFull: true } | null> {
  const deliveries = ref.collection("deliveries");
  const day = quotaDay(now);
  return deps.db.runTransaction(async tx => {
    const inFlight = await tx.get(deliveries.where("state", "==", "sending"));
    const stale = inFlight.docs.find(doc => isStaleClaim(doc.get("claimedAt")?.toDate?.() ?? null, now));
    if (stale) {
      const claimId = stale.get("claimId") as string;
      const group = inFlight.docs.filter(doc => doc.get("claimId") === claimId);
      for (const doc of group) tx.update(doc.ref, { claimedAt: now });
      // Quota was reserved when this claim was first made.
      return { claimId, memberIds: group.map(doc => doc.id), reserved: 0, reclaimed: true };
    }

    const quota = await tx.get(quotaRef(deps.db, day));
    const sentToday = Number(quota.get("sent") ?? 0);
    const size = nextChunkSize({ chunkSize: deps.config.chunkSize, dailyLimit: deps.config.dailyLimit, sentToday, pending: deps.config.chunkSize });
    if (size === 0) return { quotaFull: true as const };
    const pending = await tx.get(deliveries.where("state", "==", "pending").limit(size));
    if (pending.empty) return null;

    const claimId = crypto.randomUUID();
    for (const doc of pending.docs) tx.update(doc.ref, { state: "sending", claimId, claimedAt: now });
    tx.set(quotaRef(deps.db, day), { sent: FieldValue.increment(pending.size), day }, { merge: true });
    return { claimId, memberIds: pending.docs.map(doc => doc.id), reserved: pending.size, reclaimed: false };
  });
}

async function finishIfComplete(ref: DocumentReference, now: Date): Promise<boolean> {
  const deliveries = ref.collection("deliveries");
  const [pending, inFlight] = await Promise.all([
    deliveries.where("state", "==", "pending").limit(1).get(),
    deliveries.where("state", "==", "sending").limit(1).get()
  ]);
  if (!pending.empty || !inFlight.empty) return false;
  return ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.get("status") !== "sending") return false;
    tx.update(ref, { status: "sent", completedAt: now, updatedAt: now });
    return true;
  });
}

/**
 * Sends the next chunk. Returns progress; `done` when every delivery is sent, failed or skipped, and
 * `paused` when today's quota is used up (the page tells the admin when it can continue).
 */
export async function sendNextChunk(deps: SenderDeps, broadcastId: string): Promise<Outcome & { completedNow?: boolean }> {
  const ref = broadcastRef(deps.db, broadcastId);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "Broadcast not found");
  const data = snap.data() as Record<string, unknown>;
  if (data.status === "sent") return { ok: true, progress: await progressOf(ref) };
  if (data.status !== "sending") return fail(409, data.status === "cancelled" ? "This broadcast was canceled." : "This broadcast is not being sent.");
  if (!deps.config.enabled) return fail(409, "Sending is turned off on this site. Ask whoever manages the website to turn it on.");
  if (!approvedTextMatches(data)) return fail(409, "The text no longer matches what was approved.", "CONTENT_CHANGED");
  const footer = footerFromEnv();
  if (!footer) return fail(409, "Every broadcast needs the organization's name and postal address in its footer. Ask whoever manages the website to add them.");

  const now = deps.now();
  const claim = await claimChunk(deps, ref, now);
  if (claim && "quotaFull" in claim) {
    return { ok: true, progress: await progressOf(ref, { paused: { reason: "quota", resumesAt: nextQuotaReset(now).toISOString() } }) };
  }
  if (!claim) {
    const completedNow = await finishIfComplete(ref, now);
    return { ok: true, progress: await progressOf(ref), completedNow };
  }

  const deliveries = ref.collection("deliveries");
  const content = normalizeBroadcastContent(data);
  if (!content.ok) return fail(409, content.error);
  const audience = content.content.audience;
  const groupName = audience?.kind === "group" ? String(data.audienceGroupName ?? "").trim() || null : null;

  const memberSnaps = await deps.db.getAll(...claim.memberIds.map(id => deps.db.doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${id}`)));
  // Consent and, for a group email, group membership are checked again for every chunk: someone who
  // unsubscribed or left the group after sending started is skipped.
  const ready = memberSnaps.filter(member => member.exists && memberEmailState(member.data() ?? {}) === "ready" && inAudience(member.data() ?? {}, audience));
  const skipped = claim.memberIds.filter(id => !ready.some(member => member.id === id));

  const messages: BatchMessage[] = ready.map(member => {
    const token = signUnsubscribeToken(member.id, deps.serverKeys);
    return {
      to: String(member.get("email") || member.get("emailLower")),
      subject: content.content.subject,
      text: withUnsubscribeFooter(content.content.body, { origin: deps.origin, token, footer, groupName }),
      headers: unsubscribeHeaders(deps.origin, token)
    };
  });

  const write = deps.db.batch();
  const day = quotaDay(now);
  let released = 0;
  for (const id of skipped) write.update(deliveries.doc(id), { state: "skipped", claimId: FieldValue.delete(), skippedAt: now });
  if (skipped.length) {
    write.update(ref, { skippedCount: FieldValue.increment(skipped.length), updatedAt: now });
    if (!claim.reclaimed) released += skipped.length;
  }

  let error: string | undefined;
  if (messages.length > 0) {
    const result = await deps.sendBatch(messages, idempotencyKey(broadcastId, claim.claimId));
    if (result.ok) {
      ready.forEach((member, index) => write.update(deliveries.doc(member.id), { state: "sent", sentAt: now, providerId: result.ids[index] ?? null, claimId: FieldValue.delete() }));
      write.update(ref, { sentCount: FieldValue.increment(ready.length), updatedAt: now });
    } else {
      error = "The email service didn't accept the last batch of emails. They will be tried again.";
      let failedNow = 0;
      for (const member of ready) {
        const attempts = Number((await deliveries.doc(member.id).get()).get("attempts") ?? 0) + 1;
        const gaveUp = attempts >= MAX_ATTEMPTS;
        if (gaveUp) failedNow += 1;
        write.update(deliveries.doc(member.id), { state: gaveUp ? "failed" : "pending", attempts, claimId: FieldValue.delete(), claimedAt: FieldValue.delete() });
      }
      if (failedNow) write.update(ref, { failedCount: FieldValue.increment(failedNow), updatedAt: now });
      // Nothing went out, so give back the quota this claim reserved.
      if (!claim.reclaimed) released += ready.length;
    }
  }
  if (released) write.set(quotaRef(deps.db, day), { sent: FieldValue.increment(-released) }, { merge: true });
  await write.commit();

  if (error) return fail(502, error, "PROVIDER_ERROR");
  const completedNow = await finishIfComplete(ref, now);
  return { ok: true, progress: await progressOf(ref), completedNow };
}

/** Puts failed deliveries back in the queue (an admin chose to retry them). */
export async function retryFailed(deps: SenderDeps, broadcastId: string): Promise<Outcome> {
  const ref = broadcastRef(deps.db, broadcastId);
  const failed = await ref.collection("deliveries").where("state", "==", "failed").get();
  if (failed.empty) return fail(400, "There are no failed deliveries to retry.");
  const now = deps.now();
  const reopened = await deps.db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.get("status") !== "sending" && snap.get("status") !== "sent") return false;
    tx.update(ref, { status: "sending", failedCount: FieldValue.increment(-failed.size), updatedAt: now });
    for (const doc of failed.docs) tx.update(doc.ref, { state: "pending", attempts: 0 });
    return true;
  });
  if (!reopened) return fail(409, "This broadcast is not being sent.");
  return { ok: true, progress: await progressOf(ref) };
}

/** Members to snapshot when sending starts: everyone who can be emailed, or only those in the group. */
export async function loadRecipients(db: Firestore, audience?: BroadcastAudience): Promise<{ id: string }[]> {
  const col = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
  const snap = audience?.kind === "group" ? await col.where("groupIds", "array-contains", audience.groupId).get() : await col.get();
  const members = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Parameters<typeof memberEmailState>[0] & { groupIds?: unknown }) }));
  return selectRecipients(members, audience).map(member => ({ id: member.id }));
}

export { progressOf as broadcastProgress };
export const broadcastDoc = broadcastRef;
