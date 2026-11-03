import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { approvePasskey, deletePasskey, findPasskey, isValidCredentialId, listPasskeys } from "@/src/lib/passkeys";
import { getClientIp } from "@/src/lib/security/clientIp";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ownerUid: string; credentialId: string }> };

const bodySchema = z.object({ action: z.literal("approve") });

async function resolve(context: Params) {
  const { ownerUid, credentialId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid) || !isValidCredentialId(credentialId)) return null;
  const found = await findPasskey(credentialId);
  if (!found || found.uid !== ownerUid) return null;
  return found;
}

function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  throw error;
}

/** Approve another admin's pending passkey (needs a passkey session, and never your own). */
export async function POST(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const found = await resolve(context);
    if (!found) return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
    if (found.uid === actor.uid) {
      return NextResponse.json({ error: "Another admin must approve your new passkey" }, { status: 403 });
    }
    if (!(await approvePasskey(found.uid, found.passkey.credentialId, actor.uid))) {
      return NextResponse.json({ error: "Passkey is not waiting for approval" }, { status: 409 });
    }
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "passkey_approved",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "passkey", id: found.passkey.credentialId, summary: `Approved passkey for ${found.uid}` },
      meta: { ip: getClientIp(req.headers), route: "/api/admin/passkeys" }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Remove a passkey: your own, or (super admins) another admin's, e.g. a lost device. */
export async function DELETE(req: NextRequest, context: Params) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "Sign-in settings can't be loaded right now." }, { status: 503 });
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const found = await resolve(context);
    if (!found) return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
    const ownKey = found.uid === actor.uid;
    if (!ownKey && !isSuperAdmin(admin)) {
      return NextResponse.json({ error: "Only a super admin can remove another admin's passkey" }, { status: 403 });
    }
    if (ownKey) {
      const active = (await listPasskeys(actor.uid)).filter(p => p.status === "active");
      if (active.length <= 1 && found.passkey.status === "active") {
        return NextResponse.json({ error: "Add another passkey before removing your last one" }, { status: 409 });
      }
    }
    await deletePasskey(found.uid, found.passkey.credentialId);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "passkey_removed",
      actor: { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" },
      resource: { type: "passkey", id: found.passkey.credentialId, summary: `Removed passkey of ${found.uid}` },
      meta: { ip: getClientIp(req.headers), route: "/api/admin/passkeys" }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
