import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { OUTCOMES, RSVPS } from "@/src/lib/callCampaigns";
import { recordAttempt } from "@/src/lib/callCampaigns.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { envelopeChecker, envelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ campaignId: string; memberId: string }> };
const ROUTE = "/api/admin/call-campaigns/[campaignId]/calls/[memberId]";

const attemptSchema = z.object({
  /** Browser-chosen; the note envelope is bound to it, and a retried request cannot record twice. */
  attemptId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  outcome: z.enum(OUTCOMES),
  rsvp: z.enum(RSVPS).nullable().optional(),
  note: envelopeSchema.nullable().optional()
});

/** Appends one call attempt (plan §12.3): the assigned caller or a super admin, on an open campaign, audited without the number or the note. */
export async function POST(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { campaignId, memberId } = await context.params;
    if (!MEMBER_ID_PATTERN.test(campaignId) || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, attemptSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (body.note) {
      const checker = await envelopeChecker(actor.uid);
      if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
      if (!checker.ok(body.note as EnvelopeInput)) return NextResponse.json({ error: "Unknown or inactive encryption device." }, { status: 403 });
    }
    const now = new Date();
    const result = await recordAttempt({
      campaignId,
      memberId,
      attemptId: body.attemptId,
      input: { outcome: body.outcome, rsvp: body.rsvp ?? null },
      note: body.note ?? null,
      actorUid: actor.uid,
      actorIsSuperAdmin: isSuperAdmin(admin),
      now
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "call_attempt_recorded",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "callCampaign", id: campaignId, summary: `Call logged: ${body.outcome}${body.rsvp ? `, RSVP ${body.rsvp}` : ""}` },
      // Member id, outcome and RSVP only: never the number, never the note.
      after: { memberId, attemptId: body.attemptId, outcome: body.outcome, rsvp: body.rsvp ?? null, attempts: result.call.attemptCount },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
    });
    return NextResponse.json({ ok: true, call: result.call, counts: result.counts });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
