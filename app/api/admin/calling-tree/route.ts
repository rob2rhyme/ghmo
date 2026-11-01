import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { countByCaller } from "@/src/lib/callingTree";
import { listCallerCandidates, readAssignments, readTree, saveTree } from "@/src/lib/callingTree.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/calling-tree";
const ADMIN_ID = /^[A-Za-z0-9_-]{1,128}$/;

const saveSchema = z.object({
  callers: z.array(z.string().regex(ADMIN_ID)).max(50),
  assignments: z
    .array(z.object({ memberId: z.string().regex(MEMBER_ID_PATTERN), callerUid: z.string().regex(ADMIN_ID), manual: z.boolean() }))
    .max(5000)
});

function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  throw error;
}

/**
 * The calling tree (plan §12, 9-B). Super admins get every assignment; other admins get the callers,
 * the counts per caller and only their own assignments, so a caller never needs the whole list.
 */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const superAdmin = isSuperAdmin(admin);
    const [tree, all, candidates] = await Promise.all([readTree(), readAssignments(), listCallerCandidates()]);
    const counts = countByCaller(all, tree.callers);
    const assignments = superAdmin ? all : all.filter(a => a.callerUid === actor.uid);
    return NextResponse.json({
      me: { uid: actor.uid, superAdmin },
      tree: { ...tree, updatedAt: tree.updatedAt?.toISOString() ?? null },
      counts,
      total: all.length,
      candidates,
      assignments: assignments.map(a => ({ ...a, assignedAt: a.assignedAt?.toISOString() ?? null }))
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Replaces callers and assignments (super admin). The browser plans the split; the server checks and stores it. */
export async function PUT(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Only a super admin can change the calling tree." }, { status: 403 });
    const parsed = await parseJsonBody(req, saveSchema, { maxBytes: 1024 * 1024 });
    if (!parsed.ok) return parsed.response;
    const now = new Date();
    const result = await saveTree({ ...parsed.data, actorUid: actor.uid, now });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const counts = countByCaller(parsed.data.assignments, parsed.data.callers);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "calling_tree_updated",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "callingTree", id: "current", summary: `Calling tree v${result.version}: ${parsed.data.assignments.length} members across ${parsed.data.callers.length} callers` },
      // Counts only: who calls whom is in the tree itself, not in the log.
      after: { version: result.version, callers: parsed.data.callers, counts, added: result.added, moved: result.moved, removed: result.removed },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: ROUTE }
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
