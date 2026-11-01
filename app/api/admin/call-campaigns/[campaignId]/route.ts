import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { getAppOrigin } from "@/src/lib/appUrl";
import { logAuditEvent } from "@/src/lib/audit";
import { callerNames, callersWithWork, closeCampaign, readCalls, readCampaign } from "@/src/lib/callCampaigns.server";
import { loadAssignedMembers } from "@/src/lib/callingTree.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { notifyAdmins } from "@/src/lib/notify.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ campaignId: string }> };
const ROUTE = "/api/admin/call-campaigns/[campaignId]";
const actionSchema = z.object({ action: z.enum(["close", "remind", "export"]) });

function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  throw error;
}

/** The BOD view: the campaign, every call row, the people's names and the callers' names. Numbers stay in the envelopes. */
export async function GET(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { campaignId } = await context.params;
    if (!MEMBER_ID_PATTERN.test(campaignId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const campaign = await readCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [calls, names] = await Promise.all([readCalls(campaignId), callerNames()]);
    const members = await loadAssignedMembers(calls.map(c => ({ memberId: c.memberId, callerUid: c.callerUid })));
    return NextResponse.json({
      me: { uid: actor.uid, superAdmin: isSuperAdmin(admin) },
      campaign,
      calls,
      members: members.map(m => ({ id: m.id, name: (m.name as string | undefined) ?? null, emailLower: m.emailLower, status: m.status, hasPhone: m.hasPhone, callOptOutAt: m.callOptOutAt ?? null })),
      callerNames: names
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Close the campaign, remind the callers who still have people to reach, or record that the BOD exported it. */
export async function POST(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { campaignId } = await context.params;
    if (!MEMBER_ID_PATTERN.test(campaignId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, actionSchema);
    if (!parsed.ok) return parsed.response;
    const campaign = await readCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auditActor = { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" };
    const meta = { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE };
    const now = new Date();

    if (parsed.data.action === "close") {
      const result = await closeCampaign(campaignId, actor.uid, now);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      await logAuditEvent({
        orgSlug: COMMUNITY_SLUG,
        action: "call_campaign_closed",
        actor: auditActor,
        resource: { type: "callCampaign", id: campaignId, summary: `Call campaign closed: ${campaign.title}` },
        after: { counts: campaign.counts },
        meta
      });
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "remind") {
      if (campaign.status !== "open") return NextResponse.json({ error: "This campaign is closed." }, { status: 409 });
      const callers = callersWithWork(await readCalls(campaignId));
      const sent = await notifyAdmins("calls", actor.uid, getAppOrigin(req), callers);
      await logAuditEvent({
        orgSlug: COMMUNITY_SLUG,
        action: "call_campaign_reminded",
        actor: auditActor,
        resource: { type: "callCampaign", id: campaignId, summary: `Reminder sent to ${sent} of ${callers.length} callers with calls left` },
        after: { callers, sent },
        meta
      });
      return NextResponse.json({ ok: true, callers: callers.length, sent });
    }

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "call_campaign_exported",
      actor: auditActor,
      resource: { type: "callCampaign", id: campaignId, summary: `Call campaign exported as CSV: ${campaign.title}` },
      after: { counts: campaign.counts },
      meta
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
