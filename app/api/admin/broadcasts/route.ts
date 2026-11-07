import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { audienceFields, hashBroadcast, normalizeBroadcastContent } from "@/src/lib/broadcast";
import { audienceAudit, audienceSummary, checkAudience } from "@/src/lib/broadcastAudience.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgBroadcastsCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";
import { listBroadcasts } from "@/src/lib/adminData.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/broadcasts";

export async function GET(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ broadcasts: await listBroadcasts(guard) });
}

const createSchema = z.object({
  subject: z.string().max(1000),
  body: z.string().max(100_000),
  // Who it goes to (plan §30, D91): everyone by default, or one group that is turned on.
  audience: z.enum(["all", "group"]).optional(),
  audienceGroupId: z.string().max(128).nullable().optional()
});

/** Starts a draft. Nothing is sent; sending needs a second admin's approval first. */
export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;

  const parsed = await parseJsonBody(req, createSchema, { maxBytes: 200 * 1024 });
  if (!parsed.ok) return parsed.response;
  const checked = normalizeBroadcastContent(parsed.data);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const group = await checkAudience(checked.content.audience);
  if (!group.ok) return NextResponse.json({ error: group.error, code: group.code }, { status: 400 });

  const now = new Date();
  const ref = getAdminDb().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG)).doc();
  const record = {
    subject: checked.content.subject,
    body: checked.content.body,
    ...audienceFields(checked.content.audience),
    audienceGroupName: group.groupName,
    status: "draft",
    contentHash: hashBroadcast(checked.content),
    createdByUid: actor.uid,
    createdByName: admin.name,
    createdAt: now,
    updatedAt: now
  };
  await ref.set(record);
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "broadcast_created",
    actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
    resource: { type: "broadcast", id: ref.id, path: ref.path, summary: audienceSummary(checked.content.audience, group.groupName) },
    after: { status: "draft", contentHash: record.contentHash, ...audienceAudit(checked.content.audience, group.groupName) },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
  });
  return NextResponse.json({ ok: true, broadcast: toPlain({ id: ref.id, ...record }) }, { status: 201 });
}
