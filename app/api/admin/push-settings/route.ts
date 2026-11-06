import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin, listAdmins, requireActiveAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { pushConfig, readPushSettings, setPushEnabled } from "@/src/lib/push.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/push-settings";

async function settingsView(canChange: boolean) {
  const settings = await readPushSettings();
  const by = settings.updatedBy ? (await listAdmins(COMMUNITY_SLUG)).find(admin => admin.id === settings.updatedBy) : undefined;
  return { ...settings, updatedByName: by?.name ?? null, configured: Boolean(pushConfig()), canChange };
}

/** Whether push is on for the whole site (plan §21, D49). Any admin may read it; only a super admin may change it. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json(await settingsView(isSuperAdmin(admin)));
  } catch (error) {
    return routeError(error);
  }
}

const bodySchema = z.object({ enabled: z.boolean() }).strict();

/** Switches push on or off for the whole site. Devices and email are untouched, so switching on again resumes everything. */
export async function PUT(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const { before } = await setPushEnabled(parsed.data.enabled, actor.uid, new Date());
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "push_switched",
      actor: auditActor(actor, admin),
      resource: { type: "pushSettings", id: "settings", summary: parsed.data.enabled ? "Push notifications switched on for the site" : "Push notifications switched off for the site" },
      before: { enabled: before },
      after: { enabled: parsed.data.enabled },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, ...(await settingsView(true)) });
  } catch (error) {
    return routeError(error);
  }
}
