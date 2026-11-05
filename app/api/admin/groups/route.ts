import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/src/lib/groups";
import { createGroup, listGroupsWithCounts } from "@/src/lib/groups.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/groups";

const createSchema = z.object({
  name: z.string().max(GROUP_NAME_MAX * 2),
  description: z.string().max(GROUP_DESCRIPTION_MAX * 2).optional().default("")
});

/** Every group with its head count (plan §15, 11-A). Any admin may read. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json({ groups: await listGroupsWithCounts() });
  } catch (error) {
    return routeError(error);
  }
}

/** Makes a new group. Any admin may. */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const result = await createGroup({ ...parsed.data, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "group_created",
      actor: auditActor(actor, admin),
      resource: { type: "group", id: result.group.id, summary: `Created the group ${result.group.name}` },
      after: { name: result.group.name },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ group: { ...result.group, memberCount: 0 } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
