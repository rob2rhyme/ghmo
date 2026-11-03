import crypto from "crypto";
import { safeEqual } from "./security/compare";
import { getAdminDb } from "./firebaseAdmin";
import { getServerEnv } from "./env.server";
import { logAudit } from "./audit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { orgDonationsWebhookEventsCollectionPath, orgDonationsStatsDocPath } from "./firestorePaths";

type WebhookPayload = {
  communityId?: string;
  type?: string;
  data?: Record<string, any>;
  event_id?: string;
};

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Checks the webhook signature. The signed string is `${timestamp}.${body}` when a timestamp header is
 * sent (refused when older than five minutes, so a captured delivery can't be replayed later); a bare
 * body signature is accepted only when no timestamp header is present, for providers that don't send one.
 */
export function verifyGfmWebhookSignature(rawBody: string, signatureHeader?: string | null, timestampHeader?: string | null, nowMs = Date.now()) {
  const env = getServerEnv();
  if (!signatureHeader || !env.GOFUNDME_PRO_WEBHOOK_SECRET) return false;
  const given = signatureHeader.trim().toLowerCase().replace(/^sha256=/, "");
  let signed = rawBody;
  if (timestampHeader) {
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) return false;
    const tsMs = ts > 1_000_000_000_000 ? ts : ts * 1000;
    if (Math.abs(nowMs - tsMs) > SIGNATURE_TOLERANCE_SECONDS * 1000) return false;
    signed = `${timestampHeader}.${rawBody}`;
  }
  const expected = crypto.createHmac("sha256", env.GOFUNDME_PRO_WEBHOOK_SECRET).update(signed).digest("hex");
  return safeEqual(given, expected);
}

class DuplicateWebhookEvent extends Error {}

export async function recordWebhookEvent(communityId: string, eventId: string, payload: WebhookPayload) {
  const orgSlug = communityId === COMMUNITY_SLUG || communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG;
  const ref = getAdminDb().doc(`${orgDonationsWebhookEventsCollectionPath(orgSlug)}/${eventId}`);
  // create() inside a transaction: two deliveries of the same event can't both pass the check.
  try {
    await getAdminDb().runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) throw new DuplicateWebhookEvent();
      tx.create(ref, { ...payload, processed: false, receivedAt: new Date() });
    });
  } catch (error) {
    if (error instanceof DuplicateWebhookEvent) return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
}

export async function applyDonationStatsUpdate(communityId: string, deltaAmount: number, metadata?: Record<string, any>) {
  const orgSlug = communityId === COMMUNITY_SLUG || communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG;
  const db = getAdminDb();
  const statsRef = db.doc(orgDonationsStatsDocPath(orgSlug));
  await db.runTransaction(async tx => {
    const doc = await tx.get(statsRef);
    const prev = doc.exists ? doc.data() : {};
    const totalRaised = (prev?.totalRaised || 0) + deltaAmount;
    const donorCount = (prev?.donorCount || 0) + 1;
    tx.set(
      statsRef,
      {
        totalRaised,
        donorCount,
        lastUpdatedAt: new Date(),
        source: metadata?.source || "webhook"
      },
      { merge: true }
    );
  });
}

export async function reconcileDonationTotals(communityId: string, totals: { totalRaised: number; goal?: number; donorCount?: number }) {
  const orgSlug = communityId === COMMUNITY_SLUG || communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG;
  const statsRef = getAdminDb().doc(orgDonationsStatsDocPath(orgSlug));
  await statsRef.set(
    {
      ...totals,
      lastUpdatedAt: new Date(),
      source: "reconcile"
    },
    { merge: true }
  );
}

export async function fetchCampaignTotals() {
  const env = getServerEnv();
  if (!env.GOFUNDME_PRO_CLIENT_ID || !env.GOFUNDME_PRO_CLIENT_SECRET) {
    return null;
  }
  // Placeholder for GoFundMe Pro OAuth exchange + totals fetch. Replace with real API calls.
  return { totalRaised: 0, goal: 0, donorCount: 0 };
}

export async function logWebhookAudit(communityId: string, payload: WebhookPayload, success: boolean) {
  await logAudit({
    communityId,
    type: "webhook_received",
    metadata: { success, type: payload.type, event_id: payload.event_id }
  });
}
