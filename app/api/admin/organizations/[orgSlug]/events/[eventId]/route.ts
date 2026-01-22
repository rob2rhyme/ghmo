import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent, DEFAULT_TIMEZONE, ensureOrgSlug } from "@/src/lib/events";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
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
    const updates: Record<string, any> = {
      updatedAt: new Date()
    };
    const allowFields = [
      "title",
      "summary",
      "body",
      "status",
      "startsAt",
      "endsAt",
      "timezone",
      "location",
      "featured",
      "announcementDocTemplate",
      "announcementPdfSource"
    ];
    allowFields.forEach(key => {
      if (body[key] !== undefined) {
        if (key === "startsAt" || key === "endsAt") {
          updates[key] = body[key] ? new Date(body[key]) : null;
        } else if (key === "timezone") {
          updates[key] = body[key] || DEFAULT_TIMEZONE;
        } else {
          updates[key] = body[key];
        }
      }
    });

    const db = getAdminDb();
    const ref = db.collection(eventsCollectionPath(COMMUNITY_ID)).doc(params.eventId);
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
      resource: { type: "event", id: params.eventId, summary: `Updated event: ${updates.title || params.eventId}` },
      meta: {
        eventId: params.eventId,
        title: updates.title,
        status: updates.status,
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

export async function DELETE(req: NextRequest, { params }: { params: { orgSlug: string; eventId: string } }) {
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
