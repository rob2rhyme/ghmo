import crypto from "crypto";
import { adminDb } from "./firebaseAdmin";
import { serverEnv } from "./env.server";
import { logAudit } from "./audit";

type WebhookPayload = {
  communityId?: string;
  type?: string;
  data?: Record<string, any>;
  event_id?: string;
};

export function verifyGfmWebhookSignature(rawBody: string, signatureHeader?: string) {
  if (!signatureHeader || !serverEnv.GOFUNDME_PRO_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", serverEnv.GOFUNDME_PRO_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  return signatureHeader === expected;
}

export async function recordWebhookEvent(communityId: string, eventId: string, payload: WebhookPayload) {
  const ref = adminDb.doc(`community/${communityId}/donations/webhookEvents/${eventId}`);
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
  const statsRef = adminDb.doc(`community/${communityId}/donations/stats`);
  await adminDb.runTransaction(async tx => {
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
  const statsRef = adminDb.doc(`community/${communityId}/donations/stats`);
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
  if (!serverEnv.GOFUNDME_PRO_CLIENT_ID || !serverEnv.GOFUNDME_PRO_CLIENT_SECRET) {
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
