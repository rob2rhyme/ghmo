import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { eventsCollectionPath } from "@/src/lib/events";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgMinutesCollectionPath } from "@/src/lib/firestorePaths";
import { toDate } from "@/src/lib/format";
import { adminView } from "@/src/lib/minutesRecords";
import { planMinutesMove } from "@/src/lib/minutesMeeting";
import { expirePublicCache, PUBLIC_CACHE_TAGS } from "@/src/lib/publicCache.server";
import { toPlain } from "@/src/lib/serialize.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/minutes/move";
const DOC_ID = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const bodySchema = z.object({ id: DOC_ID, eventId: DOC_ID }).strict();

/** The event wherever it is stored (same places the minutes route looks), inside the transaction. */
async function readEvent(tx: FirebaseFirestore.Transaction, eventId: string) {
  const db = getAdminDb();
  for (const path of [eventsCollectionPath(COMMUNITY_SLUG), eventsCollectionPath(COMMUNITY_ID), `community/${COMMUNITY_ID}/events`]) {
    const snap = await tx.get(db.collection(path).doc(eventId));
    if (snap.exists) return snap;
  }
  return null;
}

/**
 * Moves draft minutes to another meeting (plan §26, D67). Any active admin, like editing minutes. The meeting's title
 * and date are copied again from the new event; the one-minutes-per-meeting rule is checked in the same transaction.
 * Encrypted content is bound to the minutes id, not the event, so it stays readable.
 */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const { id, eventId } = parsed.data;
    const db = getAdminDb();
    const ref = db.collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).doc(id);

    const outcome = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, status: 404, error: "Minutes not found" } as const;
      const before = snap.data() ?? {};
      const eventSnap = await readEvent(tx, eventId);
      const taken = await tx.get(db.collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).where("eventId", "==", eventId).limit(2));
      const eventData = eventSnap?.data() ?? {};
      const startsAt = toDate(eventData.startsAt as never);
      const plan = planMinutesMove({
        status: before.status,
        currentEventId: before.eventId,
        target: eventSnap ? { id: eventId, title: String(eventData.title ?? ""), startsAtMs: startsAt ? startsAt.getTime() : null } : null,
        targetHasMinutes: taken.docs.some(doc => doc.id !== id),
        nowMs: Date.now()
      });
      if (!plan.ok) return plan;
      tx.update(ref, { eventId, eventTitle: plan.eventTitle, eventDate: eventData.startsAt ?? null, updatedAt: new Date() });
      return { ok: true, fromTitle: String(before.eventTitle ?? "another meeting"), toTitle: plan.eventTitle } as const;
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    expirePublicCache(PUBLIC_CACHE_TAGS.minutes);

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "minutes_moved",
      actor: auditActor(actor, admin),
      resource: { type: "meeting_minutes", id, summary: `Moved minutes from ${outcome.fromTitle} to ${outcome.toTitle}` },
      after: { eventId },
      meta: auditMeta(req, ROUTE)
    });
    const after = await ref.get();
    return NextResponse.json({ ok: true, minutes: toPlain(adminView({ id, ...after.data() })) });
  } catch (error) {
    return routeError(error);
  }
}
