import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { MANUAL_CHANNELS, MANUAL_CHANNEL_LABELS, planManualPost } from "@/src/lib/broadcast";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgBroadcastsCollectionPath } from "@/src/lib/firestorePaths";
import { getClientIp } from "@/src/lib/security/clientIp";
import { toPlain } from "@/src/lib/serialize.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ROUTE = "/api/admin/broadcasts/[broadcastId]/manual-post";
const schema = z.object({ channel: z.enum(MANUAL_CHANNELS), contentHash: z.string().length(64) }).strict();

/**
 * Records that an admin pasted this approved broadcast into a Messenger group chat by hand (plan §12,
 * decision D14). Nothing is sent from here and no email setting is needed: it is the audit trail for the
 * group chats. The copied text must still be exactly what the second admin approved.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;
  const { broadcastId } = await context.params;
  if (!ID_PATTERN.test(broadcastId)) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  const parsed = await parseJsonBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const db = getAdminDb();
  const ref = db.doc(`${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${broadcastId}`);
  const now = new Date();
  const outcome = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: "Broadcast not found" } as const;
    const data = snap.data() as Record<string, unknown>;
    const plan = planManualPost({
      before: data as Parameters<typeof planManualPost>[0]["before"],
      channel: parsed.data.channel,
      contentHash: parsed.data.contentHash,
      actorUid: actor.uid,
      actorName: admin.name || actor.name || "Admin",
      now
    });
    if (!plan.ok) return plan;
    const manualPosts = [...((data.manualPosts as unknown[] | undefined) ?? []), plan.post];
    tx.update(ref, { manualPosts });
    return { ok: true, data: { ...data, manualPosts } } as const;
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...("code" in outcome ? { code: outcome.code } : {}) }, { status: outcome.status });

  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "broadcast_posted_manually",
    actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
    resource: { type: "broadcast", id: broadcastId, path: ref.path, summary: `Posted by hand to the ${MANUAL_CHANNEL_LABELS[parsed.data.channel]}` },
    // The fingerprint says exactly which approved text was posted, without a second copy of it.
    after: { channel: parsed.data.channel, contentHash: parsed.data.contentHash },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
  });
  return NextResponse.json({ ok: true, broadcast: toPlain({ id: broadcastId, ...outcome.data }) });
}
