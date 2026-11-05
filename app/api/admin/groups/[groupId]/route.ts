import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin, requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/src/lib/groups";
import { deleteGroup, listGroupMemberIds, readGroup, updateGroup } from "@/src/lib/groups.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/groups/[groupId]";
const ID = /^[A-Za-z0-9_-]{1,128}$/;

const patchSchema = z
  .object({
    name: z.string().max(GROUP_NAME_MAX * 2),
    description: z.string().max(GROUP_DESCRIPTION_MAX * 2),
    leadMemberId: z.string().regex(MEMBER_ID_PATTERN).nullable(),
    active: z.boolean()
  })
  .partial()
  .refine(value => Object.keys(value).length > 0, { message: "Nothing to change." });

/** One group and the ids of its members. */
export async function GET(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { groupId } = await context.params;
    if (!ID.test(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const group = await readGroup(groupId);
    if (!group) return NextResponse.json({ error: "That group doesn't exist." }, { status: 404 });
    return NextResponse.json({ group, memberIds: await listGroupMemberIds(groupId) });
  } catch (error) {
    return routeError(error);
  }
}

/** Renames a group, sets its lead, or switches it on or off. Any admin may. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { groupId } = await context.params;
    if (!ID.test(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    const result = await updateGroup(groupId, parsed.data);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "group_updated",
      actor: auditActor(actor, admin),
      resource: { type: "group", id: groupId, summary: `Changed the group ${result.group.name}` },
      before: { name: result.before.name, leadMemberId: result.before.leadMemberId, active: result.before.active },
      after: { name: result.group.name, leadMemberId: result.group.leadMemberId, active: result.group.active },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ group: result.group });
  } catch (error) {
    return routeError(error);
  }
}

/** Deletes a group and takes it off every member (super admin). The built-in callers group can't be deleted. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { groupId } = await context.params;
    if (!ID.test(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await deleteGroup(groupId);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "group_deleted",
      actor: auditActor(actor, admin),
      resource: { type: "group", id: groupId, summary: `Deleted the group ${result.before.name} (${result.removedFrom} people)` },
      before: { name: result.before.name },
      after: { removedFrom: result.removedFrom },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, removedFrom: result.removedFrom });
  } catch (error) {
    return routeError(error);
  }
}
