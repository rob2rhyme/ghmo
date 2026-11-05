import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { deleteNote, readMemberLabel } from "@/src/lib/memberNotes.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/organizations/[orgSlug]/members/[memberId]/notes/[noteId]";

/** Deletes a note. Only the person who wrote it, or a super admin, may. */
export async function DELETE(req: NextRequest, context: { params: Promise<{ orgSlug: string; memberId: string; noteId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, memberId, noteId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId) || !MEMBER_ID_PATTERN.test(noteId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await deleteNote({ memberId, noteId, actor: { uid: actor.uid, superAdmin: isSuperAdmin(admin) } });
    if (!result.ok) return failureResponse(result);
    const label = (await readMemberLabel(memberId)) ?? "a member";
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_note_deleted",
      actor: auditActor(actor, admin),
      resource: { type: "member", id: memberId, summary: `Deleted a note about ${label}` },
      before: { memberId, noteId, authorUid: result.note.authorUid },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
