import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { toPlain } from "@/src/lib/serialize.server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Firestore doc IDs only: no "/" so a path param cannot reach another collection. */
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]*$/;

const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().max(500).optional(),
  body: z.string().trim().min(1).max(50000).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  featured: z.boolean().optional(),
  timezone: z.string().trim().max(64).regex(TIMEZONE_PATTERN).optional(),
  location: z.string().trim().max(200).optional(),
  startsAt: z.string().max(64).nullable().optional(),
  endsAt: z.string().max(64).nullable().optional(),
  announcementDocTemplate: z.string().trim().max(200).optional(),
  announcementPdfSource: z
    .object({
      generator: z.literal("document-generator"),
      docType: z.literal("eventAnnouncement"),
      payloadVersion: z.number().int().min(0).max(1000)
    })
    .nullable()
    .optional()
});

function parseOptionalDate(
  value: string | null,
  label: "startsAt" | "endsAt"
): { date: Date | null } | { response: NextResponse } {
  if (value === null || value === "") return { date: null };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return {
      response: NextResponse.json({ ok: false, error: "INVALID_DATE", field: label }, { status: 400 })
    };
  }
  return { date: parsed };
}

/** One event, for the edit form. Dates come back as epoch milliseconds. */
export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json({ error: "Admin env not configured", missing: adminEnvStatus.missing }, { status: 503 });
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    if (!EVENT_ID_PATTERN.test(params.eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const snap = await getAdminDb().collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId).get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, event: toPlain(normalizeEvent(snap)) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json({ error: "Admin env not configured", missing: error.issues }, { status: 503 });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    if (!EVENT_ID_PATTERN.test(params.eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = await parseJsonBody(req, updateEventSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const updates: Record<string, unknown> = {
      updatedAt: new Date()
    };
    const passThroughFields = [
      "title",
      "summary",
      "body",
      "status",
      "location",
      "featured",
      "announcementDocTemplate",
      "announcementPdfSource"
    ] as const;
    for (const key of passThroughFields) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.timezone !== undefined) updates.timezone = body.timezone || DEFAULT_TIMEZONE;

    // Dates require explicit parsing to avoid storing Invalid Date values.
    let startsAt: Date | null | undefined;
    let endsAt: Date | null | undefined;
    if (body.startsAt !== undefined) {
      const result = parseOptionalDate(body.startsAt, "startsAt");
      if ("response" in result) return result.response;
      startsAt = updates.startsAt = result.date;
    }
    if (body.endsAt !== undefined) {
      const result = parseOptionalDate(body.endsAt, "endsAt");
      if ("response" in result) return result.response;
      endsAt = updates.endsAt = result.date;
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId);
    // PATCH edits existing events only; a merge-set would otherwise create a partial event.
    if (!(await ref.get()).exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    await ref.set(updates, { merge: true });
    const doc = await ref.get();
    await logAuditEvent({
      orgSlug: params.orgSlug,
      action: "event_updated",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "event", id: params.eventId, summary: `Updated event: ${body.title || params.eventId}` },
      meta: {
        eventId: params.eventId,
        title: body.title,
        status: body.status,
        route: "/api/admin/organizations/[orgSlug]/events/[eventId]"
      }
    });
    return NextResponse.json({ ok: true, event: normalizeEvent(doc) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor } = guard;
    if (!EVENT_ID_PATTERN.test(params.eventId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await getAdminDb().collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId).delete();
    await logAuditEvent({
      orgSlug: params.orgSlug,
      action: "event_deleted",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "event", id: params.eventId, summary: `Deleted event: ${params.eventId}` },
      meta: { eventId: params.eventId, route: "/api/admin/organizations/[orgSlug]/events/[eventId]" }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
