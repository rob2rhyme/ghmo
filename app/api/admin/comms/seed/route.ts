import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

const SEED_THREADS = [
  {
    title: "Welcome and guidelines",
    body: "Use this board for proposals and decisions. Close threads with a clear conclusion so future admins can audit outcomes."
  },
  {
    title: "Test thread",
    body: "Use this to practice proposing a conclusion, voting to approve/reject, and finalizing the close."
  },
  {
    title: "How to use Plans & Issues vs Admin Chat",
    body: "Plans & Issues are for formal decisions. Admin Chat is for quick coordination and daily updates."
  }
];

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const db = getAdminDb();
    const existing = await db.collection("organizations").doc("ghmo").collection("commsThreads").limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "Threads already exist." }, { status: 409 });
    }

    const batch = db.batch();
    const createdIds: string[] = [];
    SEED_THREADS.forEach(thread => {
      const ref = db.collection("organizations").doc("ghmo").collection("commsThreads").doc();
      createdIds.push(ref.id);
      batch.set(ref, {
        title: thread.title,
        body: thread.body,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: { uid: actor.uid, name: actor.name, roles: actor.roles },
        status: "open",
        lastActivityAt: FieldValue.serverTimestamp(),
        commentCount: 0,
        priority: "normal",
        pinned: false
      });
    });
    await batch.commit();

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "comms_seed_created",
      actor: { uid: actor.uid, adminId: actor.adminDocId, name: actor.name, roles: actor.roles },
      meta: { count: SEED_THREADS.length }
    });

    return NextResponse.json({
      ok: true,
      message: "Sample threads created.",
      threadIds: createdIds
    });
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
