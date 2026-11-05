import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { logAuditEvent } from "@/src/lib/audit";
import { sendingConfigFromEnv } from "@/src/lib/broadcastSending";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminEnvStatus } from "@/src/lib/env.server";
import { sendMailBatch } from "@/src/lib/mailer.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { serverEncryptionKeys } from "@/src/lib/signatureEncryption";
import { runTaskDigest } from "@/src/lib/taskDigest.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** True when the caller sent `Authorization: Bearer <CRON_SECRET>`. With no secret set, nobody can. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * The daily digest of overdue tasks (plan §16, 12-B). Vercel Cron calls this once a day with the project's
 * CRON_SECRET. It does nothing unless a super admin switched the digest on, and never runs twice in a day.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Not available" }, { status: 503 });
  let keys: Uint8Array[];
  try {
    keys = serverEncryptionKeys();
  } catch {
    return NextResponse.json({ error: "Not available" }, { status: 503 });
  }
  const result = await runTaskDigest({ config: sendingConfigFromEnv(), origin: getAppOrigin(req), now: new Date(), serverKeys: keys, sendBatch: (messages, key) => sendMailBatch(messages, key) });
  if (!result.ran) return NextResponse.json({ ran: false, reason: result.reason });
  const { summary } = result;
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "task_digest_run",
    resource: { type: "taskDigest", id: summary.day, summary: `Daily task digest: ${summary.emailed} emailed${summary.deferred ? `, ${summary.deferred} left for tomorrow` : ""}` },
    // Counts only; who was emailed is in the reminder records.
    after: { day: summary.day, status: summary.status, emailed: summary.emailed, failed: summary.failed, deferred: summary.deferred, cannotEmail: summary.cannotEmail, unassigned: summary.unassigned },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: "/api/cron/task-digest" }
  });
  return NextResponse.json({ ran: true, status: summary.status, emailed: summary.emailed, failed: summary.failed, deferred: summary.deferred });
}
