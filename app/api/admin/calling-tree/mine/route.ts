import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { loadAssignedMembers, readAssignments, readTree } from "@/src/lib/callingTree.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { memberCallState } from "@/src/lib/members";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";

/**
 * The signed-in admin's own slice of the calling tree (plan §12.3): the members assigned to them, with
 * their encrypted contact envelopes. The server filters by uid; nobody can ask for someone else's list.
 */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const [tree, assignments] = await Promise.all([readTree(), readAssignments(actor.uid)]);
    const isCaller = tree.callers.includes(actor.uid);
    const members = isCaller ? await loadAssignedMembers(assignments) : [];
    // Someone who opted out or lost their number since the last plan is kept off the caller's list.
    const callable = members.filter(member => memberCallState(member as Parameters<typeof memberCallState>[0]) === "ready");
    return NextResponse.json({
      isCaller,
      version: tree.version,
      members: callable.map(member => toPlain(member)),
      skipped: members.length - callable.length
    });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
