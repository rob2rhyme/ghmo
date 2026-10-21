import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { applyDonationStatsUpdate, logWebhookAudit, recordWebhookEvent, verifyGfmWebhookSignature } from "@/src/lib/gofundme";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

const payloadSchema = z
  .object({
    type: z.string().max(120).optional(),
    event_id: z.string().max(200).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
    data: z
      .object({
        amount: z.number().finite().nonnegative().max(10_000_000).optional(),
        campaignId: z.string().max(200).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signature = req.headers.get("x-gfmpro-signature") || req.headers.get("x-svix-signature") || req.headers.get("x-hub-signature");
  if (!verifyGfmWebhookSignature(rawBody, signature || undefined)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const payload = parsed.data;

  // Single community: never take the target organization from the payload or headers (S-14).
  const orgSlug = COMMUNITY_SLUG;

  const eventId = payload.event_id || crypto.randomUUID();
  const { duplicate } = await recordWebhookEvent(orgSlug, eventId, payload);
  if (duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (payload.type?.startsWith("transaction") && typeof payload.data?.amount === "number") {
    await applyDonationStatsUpdate(orgSlug, payload.data.amount, { source: "webhook" });
  }

  await logWebhookAudit(orgSlug, payload, true);
  return NextResponse.json({ ok: true });
}
