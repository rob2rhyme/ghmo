import crypto from "crypto";
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

export function verifyGfmWebhookSignature(rawBody: string, signatureHeader?: string) {
  const env = getServerEnv();
  if (!signatureHeader || !env.GOFUNDME_PRO_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", env.GOFUNDME_PRO_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  return signatureHeader === expected;
}

export async function recordWebhookEvent(communityId: string, eventId: string, payload: WebhookPayload) {
  const orgSlug = communityId === COMMUNITY_SLUG || communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG;
  const ref = getAdminDb().doc(`${orgDonationsWebhookEventsCollectionPath(orgSlug)}/${eventId}`);
  const existing = await ref.get();
  if (existing.exists) {
    return { duplicate: true };
  }
  await ref.set({
    ...payload,
    processed: false,
    receivedAt: new Date()
  });
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
