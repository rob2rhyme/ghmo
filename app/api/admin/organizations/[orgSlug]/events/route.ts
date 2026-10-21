import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { z } from "zod";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).optional(),
  body: z.string().trim().min(1).max(50000),
  status: z.enum(["draft", "published", "archived"]).optional(),
  featured: z.boolean().optional(),
  timezone: z.string().trim().max(64).optional(),
  location: z.string().trim().max(200).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  announcementDocTemplate: z.string().trim().max(200).optional(),
  announcementPdfSource: z.unknown().optional()
});

type ValidationErrorResponse = {
  ok: false;
  error: "VALIDATION_ERROR";
  details: { path: string; message: string }[];
};

function toValidationErrorResponse(errors: z.ZodError): ValidationErrorResponse {
  return {
    ok: false,
    error: "VALIDATION_ERROR",
    details: errors.issues.map(issue => ({
      path: issue.path.join(".") || "payload",
      message: issue.message
    }))
  };
}

function parseOptionalDate(
  value: string | null | undefined,
  label: "startsAt" | "endsAt"
): { date: Date | null } | { response: NextResponse } {
  if (value === undefined || value === null || value === "") {
    return { date: null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
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
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
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
    let query: FirebaseFirestore.Query = db.collection(eventsCollectionPath(COMMUNITY_ID));
    if (status === "published" || status === "draft") {
      query = query.where("status", "==", status);
    }
    query = query.orderBy("startsAt", "desc");
    const snap = await query.limit(200).get();
    const events = snap.docs.map(normalizeEvent);
    return NextResponse.json({ ok: true, events });
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

export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
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

    const body = await req.json();
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(toValidationErrorResponse(parsed.error), { status: 400 });
    }

    // Dates require explicit parsing to avoid storing Invalid Date values.
    const startsAtResult = parseOptionalDate(parsed.data.startsAt, "startsAt");
    if ("response" in startsAtResult) return startsAtResult.response;
    const endsAtResult = parseOptionalDate(parsed.data.endsAt, "endsAt");
    if ("response" in endsAtResult) return endsAtResult.response;
    if (startsAtResult.date && endsAtResult.date && endsAtResult.date < startsAtResult.date) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
    }

    const now = new Date();
    const payload = {
      title: parsed.data.title,
      summary: parsed.data.summary,
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

    const ref = await getAdminDb().collection(eventsCollectionPath(COMMUNITY_ID)).add(payload);
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
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
