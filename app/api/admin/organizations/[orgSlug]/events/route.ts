import { NextRequest, NextResponse } from "next/server";
import { assertCommunityRole } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAudit } from "@/src/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (!ensureOrgSlug(params.orgSlug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = await assertCommunityRole("admin");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query: FirebaseFirestore.Query = adminDb.collection(eventsCollectionPath(COMMUNITY_ID));
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
  const admin = await assertCommunityRole("admin");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    createdByUid: admin.uid
  };

  if (!payload.title || !payload.body) {
    return NextResponse.json({ error: "Missing title/body" }, { status: 400 });
  }

  const ref = await adminDb.collection(eventsCollectionPath(COMMUNITY_ID)).add(payload);
  const doc = await ref.get();
  await logAudit({
    communityId: COMMUNITY_ID,
    type: "event_created",
    summary: `Created event: ${payload.title}`,
    actorUid: admin.uid,
    role: admin.role,
    metadata: { eventId: ref.id, title: payload.title, status: payload.status }
  });
  return NextResponse.json({ ok: true, event: normalizeEvent(doc) });
}
