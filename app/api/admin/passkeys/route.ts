import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { listPasskeys, listPendingPasskeysForApproval, type StoredPasskey } from "@/src/lib/passkeys";

export const dynamic = "force-dynamic";

function toPublic(p: StoredPasskey) {
  return {
    credentialId: p.credentialId,
    name: p.name,
    status: p.status,
    deviceType: p.deviceType,
    backedUp: p.backedUp,
    prfEnabled: p.prfEnabled,
    createdVia: p.createdVia,
    createdAt: p.createdAt?.toDate().toISOString() ?? null,
    lastUsedAt: p.lastUsedAt?.toDate().toISOString() ?? null
  };
}

/** The signed-in admin's passkeys, plus other admins' passkeys waiting for approval. */
export async function GET(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const [mine, pending] = await Promise.all([listPasskeys(actor.uid), listPendingPasskeysForApproval(actor.uid)]);
    return NextResponse.json({
      uid: actor.uid,
      mine: mine.map(toPublic),
      pendingApprovals: pending.map(p => ({ ownerUid: p.ownerUid, ownerName: p.ownerName, ...toPublic(p.passkey) }))
    });
  } catch (error) {
    if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    throw error;
  }
}
