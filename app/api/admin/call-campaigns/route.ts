import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { getAppOrigin } from "@/src/lib/appUrl";
import { logAuditEvent } from "@/src/lib/audit";
import { normalizeTitle, TITLE_MAX } from "@/src/lib/callCampaigns";
import { createCampaign, listCampaigns, readCalls } from "@/src/lib/callCampaigns.server";
import { loadAssignedMembers } from "@/src/lib/callingTree.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { envelopeChecker, envelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { notifyAdmins } from "@/src/lib/notify.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { toPlain } from "@/src/lib/serialize.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/call-campaigns";

const createSchema = z.object({
  /** Browser-chosen, because the script envelope is bound to it. */
  id: z.string().regex(MEMBER_ID_PATTERN),
  title: z.string().max(TITLE_MAX * 2),
  eventId: z.string().regex(MEMBER_ID_PATTERN).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  script: envelopeSchema.nullable().optional()
});

function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: "This can't be loaded right now. Try again in a moment; if it keeps happening, tell whoever manages the website." }, { status: 503 });
  throw error;
}

/** Every campaign with its counts; with `?mine=1`, also the caller's own rows and members for each open campaign. */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "This can't be loaded right now. Try again in a moment; if it keeps happening, tell whoever manages the website." }, { status: 503 });
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const campaigns = await listCampaigns();
    const mine: Record<string, { calls: unknown[]; members: unknown[] }> = {};
    if (new URL(req.url).searchParams.get("mine") === "1") {
      for (const campaign of campaigns.filter(c => c.status === "open")) {
        const calls = await readCalls(campaign.id, actor.uid);
        if (calls.length === 0) continue;
        const members = await loadAssignedMembers(calls.map(c => ({ memberId: c.memberId, callerUid: c.callerUid })));
        mine[campaign.id] = { calls, members: members.map(m => toPlain(m)) };
      }
    }
    // The script stays an envelope here; callers decrypt it on their own devices for My Calls.
    return NextResponse.json({ me: { uid: actor.uid }, campaigns, mine });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Opens a campaign from the current calling tree (any active admin); emails the callers who have people in it. */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "This can't be loaded right now. Try again in a moment; if it keeps happening, tell whoever manages the website." }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (body.script) {
      const checker = await envelopeChecker(actor.uid);
      if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
      if (!checker.ok(body.script as EnvelopeInput)) return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
    }
    const now = new Date();
    const result = await createCampaign({
      id: body.id,
      title: normalizeTitle(body.title),
      eventId: body.eventId ?? null,
      script: body.script ?? null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      actorUid: actor.uid,
      now
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "call_campaign_created",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "callCampaign", id: result.campaign.id, summary: `Call campaign opened: ${result.campaign.title} (${result.campaign.counts.total} people, ${result.callers.length} callers)` },
      after: { title: result.campaign.title, eventId: result.campaign.eventId, dueAt: result.campaign.dueAt, counts: result.campaign.counts, callers: result.callers, treeVersion: result.campaign.treeVersion },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
    });
    void notifyAdmins("calls", actor.uid, getAppOrigin(req), result.callers);
    return NextResponse.json({ ok: true, campaign: { ...result.campaign, script: undefined } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
