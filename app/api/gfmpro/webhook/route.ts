import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { applyDonationStatsUpdate, logWebhookAudit, recordWebhookEvent, verifyGfmWebhookSignature } from "@/src/lib/gofundme";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-gfmpro-signature") || req.headers.get("x-svix-signature") || req.headers.get("x-hub-signature");

  if (!verifyGfmWebhookSignature(rawBody, signature || undefined)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    communityId?: string;
    type?: string;
    data?: { amount?: number; campaignId?: string };
    event_id?: string;
  };

  const communityId = payload.communityId || req.headers.get("x-community-id") || COMMUNITY_ID;
  const orgSlug = communityId === COMMUNITY_ID ? COMMUNITY_SLUG : communityId || COMMUNITY_SLUG;

  const eventId = payload.event_id || crypto.randomUUID();
  const { duplicate } = await recordWebhookEvent(orgSlug, eventId, payload);
  if (duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let success = true;
  if (payload.type?.startsWith("transaction")) {
    const amount = Number(payload.data?.amount || 0);
    if (!Number.isNaN(amount)) {
      await applyDonationStatsUpdate(orgSlug, amount, { source: "webhook" });
    }
  }

  await logWebhookAudit(orgSlug, payload, success);
  return NextResponse.json({ ok: true });
}
