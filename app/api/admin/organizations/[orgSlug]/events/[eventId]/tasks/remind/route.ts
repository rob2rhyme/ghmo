import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { logAuditEvent } from "@/src/lib/audit";
import { sendingConfigFromEnv } from "@/src/lib/broadcastSending";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { sendMailBatch } from "@/src/lib/mailer.server";
import { serverEncryptionKeys } from "@/src/lib/signatureEncryption";
import { REMINDER_SENDS_PER_HOUR } from "@/src/lib/taskReminders";
import { previewReminders, sendReminders } from "@/src/lib/taskReminders.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";
// One database transaction and one provider request.
export const maxDuration = 30;

const ROUTE = "/api/admin/organizations/[orgSlug]/events/[eventId]/tasks/remind";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const bodySchema = z.object({ mode: z.enum(["all", "overdue"]), send: z.boolean().optional().default(false) });

/**
 * Reminds the people who own an event's tasks (plan §16, 12-A). With `send: false` it only previews who would be
 * emailed and who can't be; with `send: true` it emails them. Any active admin may.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, eventId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !ID.test(eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const { mode, send } = parsed.data;

    if (!send) {
      const preview = await previewReminders({ eventId, mode, now: new Date() });
      if (!preview.ok) return failureResponse(preview);
      return NextResponse.json({ plan: preview.plan, event: preview.event, blocker: preview.blocker, quotaLeft: preview.quotaLeft, mode: preview.mode });
    }

    const limited = await checkRateLimit(`task-reminders:${actor.uid}`, REMINDER_SENDS_PER_HOUR, 60 * 60 * 1000);
    if (!limited.success) {
      return NextResponse.json({ error: "You have sent several reminders in the last hour. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryInMs / 1000)) } });
    }
    let keys: Uint8Array[];
    try {
      keys = serverEncryptionKeys();
    } catch {
      return NextResponse.json({ error: "Reminders can't be sent right now. Ask whoever manages the website." }, { status: 503 });
    }
    const result = await sendReminders({
      eventId,
      mode,
      actorUid: actor.uid,
      deps: { config: sendingConfigFromEnv(), origin: getAppOrigin(req), now: new Date(), serverKeys: keys, sendBatch: (messages, key) => sendMailBatch(messages, key) }
    });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "event_tasks_reminded",
      actor: auditActor(actor, admin),
      resource: { type: "event", id: eventId, summary: `Reminded ${result.emailed} ${result.emailed === 1 ? "person" : "people"} about event tasks` },
      // Counts only: who was emailed is in the reminder records, not in the log.
      after: { eventId, mode, emailed: result.emailed, failed: result.failed, skippedAtSend: result.skippedAtSend, cannotEmail: result.plan.cannotEmail.length },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ emailed: result.emailed, failed: result.failed, skippedAtSend: result.skippedAtSend, plan: result.plan });
  } catch (error) {
    return routeError(error);
  }
}
