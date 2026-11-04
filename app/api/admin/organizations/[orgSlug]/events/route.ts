import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { normalizeEvent, primaryEventsPath, queryAllEvents, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { z } from "zod";
import { toPlain } from "@/src/lib/serialize.server";
import { isValidTimeZone, parseEventDate } from "@/src/lib/zonedTime";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { expirePublicCache, PUBLIC_CACHE_TAGS } from "@/src/lib/publicCache.server";

export const dynamic = "force-dynamic";

const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]*$/;

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).optional(),
  body: z.string().trim().min(1).max(50000),
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

/** Reads a form date in the event's own time zone (zone-less "2026-12-12T19:00" means 7 PM there). */
function parseOptionalDate(
  value: string | null | undefined,
  label: "startsAt" | "endsAt",
  timeZone: string
): { date: Date | null } | { response: NextResponse } {
  if (value === undefined || value === null || value === "") return { date: null };
  const parsed = parseEventDate(value, timeZone);
  if (!parsed) {
    return {
      response: NextResponse.json({ ok: false, error: "INVALID_DATE", field: label }, { status: 400 })
    };
  }
  return { date: parsed };
}

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const db = getAdminDb();
    const docs = await queryAllEvents(db, query => {
      let q = query;
      if (status === "published" || status === "draft") q = q.where("status", "==", status);
      return q.orderBy("startsAt", "desc").limit(200);
    });
    const events = docs.map(doc => toPlain(normalizeEvent(doc)));
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const parsed = await parseJsonBody(req, createEventSchema);
    if (!parsed.ok) return parsed.response;

    if (parsed.data.timezone && !isValidTimeZone(parsed.data.timezone)) {
      return NextResponse.json({ ok: false, error: "INVALID_TIMEZONE" }, { status: 400 });
    }
    const timeZone = parsed.data.timezone || DEFAULT_TIMEZONE;

    // Dates require explicit parsing to avoid storing Invalid Date values.
    const startsAtResult = parseOptionalDate(parsed.data.startsAt, "startsAt", timeZone);
    if ("response" in startsAtResult) return startsAtResult.response;
    const endsAtResult = parseOptionalDate(parsed.data.endsAt, "endsAt", timeZone);
    if ("response" in endsAtResult) return endsAtResult.response;
    if (startsAtResult.date && endsAtResult.date && endsAtResult.date < startsAtResult.date) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
    }

    const now = new Date();
    const payload = {
      title: parsed.data.title,
      summary: parsed.data.summary ?? "",
      body: parsed.data.body,
      status: parsed.data.status || "draft",
      startsAt: startsAtResult.date,
      endsAt: endsAtResult.date,
      timezone: parsed.data.timezone || DEFAULT_TIMEZONE,
      location: parsed.data.location || "",
      featured: !!parsed.data.featured,
      announcementDocTemplate: parsed.data.announcementDocTemplate || null,
      announcementPdfSource: parsed.data.announcementPdfSource || null,
      createdAt: now,
      updatedAt: now,
      createdByUid: actor.uid
    };

    const ref = await getAdminDb().collection(primaryEventsPath()).add(payload);
    expirePublicCache(PUBLIC_CACHE_TAGS.events);
    const doc = await ref.get();
    await logAuditEvent({
      orgSlug: params.orgSlug,
      action: "event_created",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "event", id: ref.id, summary: `Created event: ${payload.title}` },
      meta: {
        eventId: ref.id,
        title: payload.title,
        status: payload.status,
        route: "/api/admin/organizations/[orgSlug]/events"
      }
    });
    return NextResponse.json({ ok: true, event: normalizeEvent(doc) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}
