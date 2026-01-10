import { NextRequest, NextResponse } from "next/server";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";

type AuditPayload = {
  action?: string;
  resource?: {
    type?: string;
    id?: string;
    path?: string;
    summary?: string;
  };
  meta?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor } = guard;

  const payload = (await req.json().catch(() => ({}))) as AuditPayload;
  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action,
    actor: { uid: actor.uid, adminId: actor.adminDocId, name: actor.name, roles: actor.roles },
    resource: payload.resource,
    meta: payload.meta
  });

  return NextResponse.json({ ok: true });
}
