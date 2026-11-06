import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin, requireActiveAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { sendingConfigFromEnv } from "@/src/lib/broadcastSending";
import { sendingBlocker } from "@/src/lib/broadcastSender.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { isMailConfigured } from "@/src/lib/mailer.server";
import { readDigestSettings, setDigestEnabled } from "@/src/lib/taskDigest.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/task-digest";
const bodySchema = z.object({ enabled: z.boolean() });

/** The daily digest switch and its last run (plan §16, 12-B). Any admin may read. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json({
      settings: await readDigestSettings(),
      superAdmin: isSuperAdmin(admin),
      // The schedule can only call the site when a secret is set; the digest can only send when email is set up.
      scheduleReady: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
      blocker: sendingBlocker(sendingConfigFromEnv(), isMailConfigured())
    });
  } catch (error) {
    return routeError(error);
  }
}

/** Switches the daily digest on or off (super admin). It is off until someone does this. */
export async function PUT(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const result = await setDigestEnabled(parsed.data.enabled, actor.uid);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "task_digest_switched",
      actor: auditActor(actor, admin),
      resource: { type: "taskDigest", id: "settings", summary: `Turned the daily task digest ${result.enabled ? "on" : "off"}` },
      before: { enabled: result.before },
      after: { enabled: result.enabled },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ settings: { enabled: result.enabled, updatedAt: result.updatedAt, updatedBy: result.updatedBy, lastRun: result.lastRun } });
  } catch (error) {
    return routeError(error);
  }
}
