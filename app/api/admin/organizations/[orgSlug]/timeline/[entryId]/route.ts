import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ orgSlug: string; entryId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const payload = (await req.json()) as { title?: string; body?: string; tags?: string[] };
    if (payload.title !== undefined && !payload.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    if (payload.body !== undefined && typeof payload.body !== "string") {
      return NextResponse.json({ error: "Body must be a string" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection(orgTimelineCollectionPath(params.orgSlug)).doc(params.entryId);
    const docSnap = await ref.get();
    if (!docSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const update: Record<string, any> = { updatedAt: new Date() };
    if (payload.title !== undefined) update.title = payload.title;
    if (payload.body !== undefined) update.body = payload.body;
    if (Array.isArray(payload.tags)) update.tags = payload.tags;

    await ref.set(update, { merge: true });
    const updatedSnap = await ref.get();
    const updated = updatedSnap.data() || {};

    await logAuditEvent({
      orgSlug: params.orgSlug,
      action: "timeline_entry_updated",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: {
        type: "timeline_entry",
        id: ref.id,
        summary: `Updated timeline entry: ${update.title || updated.title || params.entryId}`
      },
      before: toPlain({ id: ref.id, ...docSnap.data() }),
      after: toPlain({ id: ref.id, ...updated }),
      meta: { action: "edit_timeline", id: ref.id, route: "/api/admin/organizations/[orgSlug]/timeline/[entryId]" }
    });

    return NextResponse.json(toPlain({ ok: true, id: ref.id, timeline: { id: ref.id, ...updated } }));
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

export async function DELETE(req: NextRequest, context: { params: Promise<{ orgSlug: string; entryId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: "Deletion not allowed" }, { status: 405 });
}
