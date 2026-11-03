import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { normalizeBroadcastContent, planBroadcastTransition, planContentEdit } from "@/src/lib/broadcast";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { toPlain } from "@/src/lib/serialize.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";
import { broadcastRecipientCount, loadBroadcastDetail, loadBroadcastDoc } from "@/src/lib/adminData.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/broadcasts/[broadcastId]";
const load = loadBroadcastDoc;
const recipientCount = broadcastRecipientCount;

export async function GET(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const detail = await loadBroadcastDetail((await context.params).broadcastId);
  if (!detail) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  return NextResponse.json(detail);
}

const patchSchema = z.union([
  z.object({ subject: z.string().max(1000), body: z.string().max(100_000) }).strict(),
  z.object({ action: z.enum(["submit", "approve", "withdraw", "cancel"]), contentHash: z.string().length(64).optional() }).strict()
]);

/** Either saves new content, or moves the broadcast along (submit, approve, withdraw, cancel). Never both. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;

  const found = await load((await context.params).broadcastId);
  if (!found) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  const parsed = await parseJsonBody(req, patchSchema, { maxBytes: 200 * 1024 });
  if (!parsed.ok) return parsed.response;

  const now = new Date();
  let checkedContent: ReturnType<typeof normalizeBroadcastContent> | null = null;
  if (!("action" in parsed.data)) {
    checkedContent = normalizeBroadcastContent(parsed.data);
    if (!checkedContent.ok) return NextResponse.json({ error: checkedContent.error }, { status: 400 });
  }

  // Plan and write inside one transaction, so a concurrent edit and approval can't interleave
  // (for example, approving text that changed a moment earlier).
  type Plan = ReturnType<typeof planContentEdit> | ReturnType<typeof planBroadcastTransition>;
  const outcome = await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(found.ref);
    if (!snap.exists) return { plan: null as Plan | null, after: null as Record<string, unknown> | null };
    const before = snap.data() as Parameters<typeof planContentEdit>[0];
    const plan: Plan =
      "action" in parsed.data
        ? planBroadcastTransition({ before, action: parsed.data.action, actorUid: actor.uid, now, contentHash: parsed.data.contentHash })
        : planContentEdit(before, (checkedContent as Extract<typeof checkedContent, { ok: true }>).content, now);
    if (!plan.ok) return { plan, after: null, beforeStatus: null as string | null };
    tx.set(found.ref, plan.updates, { merge: true });
    return {
      plan,
      after: { ...(before as Record<string, unknown>), ...plan.updates } as Record<string, unknown>,
      beforeStatus: ((before as { status?: string }).status ?? "draft") as string | null
    };
  });
  if (!outcome.plan) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  const plan = outcome.plan;
  if (!plan.ok) return NextResponse.json({ error: plan.error, code: plan.code }, { status: plan.status });
  const after = outcome.after as Record<string, unknown>;
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: plan.audit,
    actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
    resource: { type: "broadcast", id: found.ref.id, path: found.ref.path },
    // Status and fingerprint only: the audit log does not need a second copy of the message.
    before: { status: outcome.beforeStatus },
    after: { status: after.status, contentHash: after.contentHash },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
  });
  return NextResponse.json({ ok: true, broadcast: toPlain({ id: found.ref.id, ...after }), recipientCount: await recipientCount() });
}
