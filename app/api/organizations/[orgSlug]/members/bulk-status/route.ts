import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/organizations/ghmo/members/bulk-status";
/** The same ceiling as a group change (plan §28, D78). */
const BULK_MAX = 200;

const bodySchema = z
  .object({
    ids: z.array(z.string().regex(MEMBER_ID_PATTERN)).min(1).max(BULK_MAX),
    status: z.enum(["active", "disabled"])
  })
  .strict();

/**
 * Turns several members off or on (plan §28, D78–D80). Any active admin, like the per-row action. Members already in
 * that state and unknown ids are skipped; one activity entry records how many changed, never names or addresses.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    if ((await context.params).orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`members-bulk-status:${actor.uid}`, 30, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of changes in an hour. Wait a little and try again." }, { status: 429 });
    }
    const { status } = parsed.data;
    const ids = [...new Set(parsed.data.ids)];
    const db = getAdminDb();
    const col = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
    const snaps = await db.getAll(...ids.map(id => col.doc(id)));
    const toChange = snaps.filter(snap => snap.exists && snap.get("status") !== status);
    const now = new Date();
    for (let i = 0; i < toChange.length; i += 400) {
      const batch = db.batch();
      for (const snap of toChange.slice(i, i + 400)) batch.update(snap.ref, { status, updatedAt: now });
      await batch.commit();
    }
    const changed = toChange.length;
    const skipped = ids.length - changed;
    if (changed > 0) {
      await logAuditEvent({
        orgSlug: COMMUNITY_SLUG,
        action: "members_status_bulk",
        actor: auditActor(actor, admin),
        resource: { type: "member", id: "bulk", summary: `${status === "disabled" ? "Turned off" : "Turned on"} ${changed} member${changed === 1 ? "" : "s"}` },
        after: { status, changed, skipped },
        meta: auditMeta(req, ROUTE)
      });
    }
    return NextResponse.json({ ok: true, changed, skipped, ids: toChange.map(snap => snap.id) });
  } catch (error) {
    return routeError(error);
  }
}
