import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;
  const { actor } = guard;

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
}

export async function POST(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;
  const { actor } = guard;

  const body = await req.json();
  const now = new Date();
  const payload = {
    title: body.title,
    summary: body.summary,
    body: body.body,
    status: body.status || "draft",
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    timezone: body.timezone || DEFAULT_TIMEZONE,
    location: body.location || "",
    featured: !!body.featured,
    announcementDocTemplate: body.announcementDocTemplate || null,
    announcementPdfSource: body.announcementPdfSource || null,
    createdAt: now,
    updatedAt: now,
    createdByUid: actor.uid
  };

  if (!payload.title || !payload.body) {
    return NextResponse.json({ error: "Missing title/body" }, { status: 400 });
  }

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
    meta: { eventId: ref.id, title: payload.title, status: payload.status, route: "/api/admin/organizations/[orgSlug]/events" }
  });
  return NextResponse.json({ ok: true, event: normalizeEvent(doc) });
}
