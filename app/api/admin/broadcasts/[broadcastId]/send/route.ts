import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { getAppOrigin } from "@/src/lib/appUrl";
import { logAuditEvent } from "@/src/lib/audit";
import { sendingConfigFromEnv } from "@/src/lib/broadcastSending";
import { loadRecipients, retryFailed, sendNextChunk, sendingBlocker, startSending, type SenderDeps } from "@/src/lib/broadcastSender.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgBroadcastsCollectionPath } from "@/src/lib/firestorePaths";
import { isMailConfigured, sendMailBatch } from "@/src/lib/mailer.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { serverEncryptionKeys } from "@/src/lib/signatureEncryption";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";
// A chunk is one provider request plus a few Firestore writes; this leaves headroom on Vercel.
export const maxDuration = 30;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ROUTE = "/api/admin/broadcasts/[broadcastId]/send";

/**
 * Sending an approved broadcast (plan §10.3, 8-D). The page calls:
 *   { step: "start" }        once: snapshots the recipients (one per admin per hour)
 *   { step: "chunk" }        repeatedly until `done`, or until `paused` by the daily quota
 *   { step: "retryFailed" }  to queue failed deliveries again
 * Any active admin may start or continue a broadcast that a second admin has approved.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;
  const { broadcastId } = await context.params;
  if (!ID_PATTERN.test(broadcastId)) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

  const parsed = await parseJsonBody(req, z.object({ step: z.enum(["start", "chunk", "retryFailed"]) }));
  if (!parsed.ok) return parsed.response;
  const { step } = parsed.data;

  const config = sendingConfigFromEnv();
  const blocker = sendingBlocker(config, isMailConfigured());
  if (blocker && step !== "retryFailed") return NextResponse.json({ error: blocker, code: "SENDING_BLOCKED" }, { status: 409 });

  const db = getAdminDb();
  const deps: SenderDeps = {
    db,
    config,
    origin: getAppOrigin(req),
    now: () => new Date(),
    serverKeys: serverEncryptionKeys(),
    sendBatch: (messages, key) => sendMailBatch(messages, key)
  };
  const audit = (action: string, after: Record<string, unknown>) =>
    logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action,
      actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
      resource: { type: "broadcast", id: broadcastId, path: `${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${broadcastId}` },
      after,
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
    });

  if (step === "start") {
    const limited = await checkRateLimit(`broadcast-start:${actor.uid}`, 1, 60 * 60 * 1000);
    if (!limited.success) {
      return NextResponse.json({ error: "You started a broadcast less than an hour ago. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryInMs / 1000)) } });
    }
    const outcome = await startSending(deps, broadcastId, await loadRecipients(db));
    if (!outcome.ok) return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
    await audit("broadcast_sending_started", { total: outcome.progress.total });
    return NextResponse.json({ ok: true, progress: outcome.progress });
  }

  if (step === "retryFailed") {
    const outcome = await retryFailed(deps, broadcastId);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    await audit("broadcast_retry_failed", { remaining: outcome.progress.remaining });
    return NextResponse.json({ ok: true, progress: outcome.progress });
  }

  const outcome = await sendNextChunk(deps, broadcastId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
  if (outcome.completedNow) {
    const { total, sent, failed, skipped } = outcome.progress;
    await audit("broadcast_sent", { total, sent, failed, skipped });
  }
  return NextResponse.json({ ok: true, progress: outcome.progress });
}
