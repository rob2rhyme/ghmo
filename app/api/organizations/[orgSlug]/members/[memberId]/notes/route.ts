import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { envelopeChecker, envelopeSchema } from "@/src/lib/e2eeEnvelope.server";
import { MEMBER_ID_PATTERN } from "@/src/lib/memberContact.server";
import { addNote, listNotes, readMemberLabel } from "@/src/lib/memberNotes.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/organizations/[orgSlug]/members/[memberId]/notes";
const bodySchema = z.object({ id: z.string().regex(MEMBER_ID_PATTERN), enc: envelopeSchema }).strict();

type Context = { params: Promise<{ orgSlug: string; memberId: string }> };

/** The notes on a member, newest first, as stored: the text is still encrypted and is opened on the admin's device. */
export async function GET(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, memberId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((await readMemberLabel(memberId)) === null) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ notes: await listNotes(memberId) });
  } catch (error) {
    return routeError(error);
  }
}

/** Adds a note. The browser encrypts the text and chooses the note id. Any active admin may add one. */
export async function POST(req: NextRequest, context: Context) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const { orgSlug, memberId } = await context.params;
    if (orgSlug !== COMMUNITY_SLUG || !MEMBER_ID_PATTERN.test(memberId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const label = await readMemberLabel(memberId);
    if (label === null) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const checker = await envelopeChecker(actor.uid);
    if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
    if (!checker.ok(parsed.data.enc)) return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
    const result = await addNote({ memberId, noteId: parsed.data.id, enc: parsed.data.enc, authorUid: actor.uid, authorName: admin.name, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "member_note_added",
      actor: auditActor(actor, admin),
      resource: { type: "member", id: memberId, summary: `Added a note about ${label}` },
      // The note's text is never in the log; only that one was added.
      after: { memberId, noteId: parsed.data.id },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
