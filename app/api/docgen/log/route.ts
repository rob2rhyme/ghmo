import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { logAudit } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDocgenGenerationsCollectionPath } from "@/src/lib/firestorePaths";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

// The generator client currently sends the rendered PNG/JPEG previews as data URLs
// in `outputRefs`, so the body cap is raised for this route. Those blobs are not
// stored (they would blow the 1 MiB Firestore document limit); only short
// non-data references are kept.
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_STORED_REF_LENGTH = 2048;

const bodySchema = z.object({
  templateId: z.string().trim().min(1).max(200),
  inputs: z
    .record(z.string().max(5000))
    .refine(value => Object.keys(value).length <= 100, "Too many inputs")
    .optional(),
  outputRefs: z.array(z.string().max(MAX_BODY_BYTES)).max(10).optional(),
  // Sent by the client but ignored: the community is fixed server-side.
  communityId: z.string().max(200).optional()
});

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
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

    const parsed = await parseJsonBody(req, bodySchema, { maxBytes: MAX_BODY_BYTES });
    if (!parsed.ok) return parsed.response;
    const { templateId } = parsed.data;
    const inputs = parsed.data.inputs ?? {};
    const outputRefs = (parsed.data.outputRefs ?? []).filter(
      ref => !ref.startsWith("data:") && ref.length <= MAX_STORED_REF_LENGTH
    );

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
