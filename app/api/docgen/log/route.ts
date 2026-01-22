import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDocgenGenerationsCollectionPath } from "@/src/lib/firestorePaths";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { templateId, inputs, outputRefs } = await req.json();
    let actor;
    try {
      const guard = await requireActiveAdmin(req, COMMUNITY_SLUG);
      actor = guard.actor;
    } catch (error) {
      if (error instanceof AdminAccessError) {
        return NextResponse.json({ error: "Unauthorized", reason: error.reason }, { status: error.status });
      }
      throw error;
    }

    const actorUid = actor.uid;
    const actorRole = actor.roles[0] ?? "admin";
    const ref = getAdminDb().collection(orgDocgenGenerationsCollectionPath(COMMUNITY_SLUG));
    const doc = await ref.add({
      templateId,
      inputs,
      createdBy: actorUid,
      createdAt: new Date(),
      outputRefs
    });
    await logAudit({
      communityId: COMMUNITY_SLUG,
      type: "doc_generated",
      actorUid,
      role: actorRole,
      metadata: { templateId, generationId: doc.id }
    });
    return NextResponse.json({ ok: true, id: doc.id });
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
