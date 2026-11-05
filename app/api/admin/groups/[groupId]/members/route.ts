import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MAX_MEMBERS_PER_CHANGE } from "@/src/lib/groups";
import { updateGroupMembers } from "@/src/lib/groups.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/groups/[groupId]/members";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const bodySchema = z.object({
  add: z.array(z.string().regex(MEMBER_ID_PATTERN)).max(MAX_MEMBERS_PER_CHANGE + 1).optional().default([]),
  remove: z.array(z.string().regex(MEMBER_ID_PATTERN)).max(MAX_MEMBERS_PER_CHANGE + 1).optional().default([])
});

/** Adds and removes people in a group. Any admin may. Counts only go in the log, never names. */
export async function POST(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { groupId } = await context.params;
    if (!ID.test(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const result = await updateGroupMembers({ groupId, ...parsed.data, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "group_members_changed",
      actor: auditActor(actor, admin),
      resource: { type: "group", id: groupId, summary: `${result.group.name}: ${result.added.length} added, ${result.removed.length} removed` },
      after: { added: result.added.length, removed: result.removed.length },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ added: result.added, removed: result.removed });
  } catch (error) {
    return routeError(error);
  }
}
