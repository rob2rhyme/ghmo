import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "./admin";
import { logAuditEvent } from "./audit";
import { COMMUNITY_SLUG } from "./community";
import { KeyringError } from "./e2eeStore";
import { AdminEnvError, getAdminEnvStatus } from "./env.server";
import { getClientIp } from "./security/clientIp";

type Guard = Awaited<ReturnType<typeof requireActiveAdmin>>;

/** Shared wrapper for E2EE keyring routes: passkey admin required, uniform errors. */
export function e2eeRoute<C>(handler: (req: NextRequest, guard: Guard, context: C) => Promise<Response>) {
  return async (req: NextRequest, context: C) => {
    if (!getAdminEnvStatus().ok) return NextResponse.json({ error: "This can't be loaded right now. Try again in a few minutes." }, { status: 503 });
    try {
      const guard = await requireActiveAdmin(req, COMMUNITY_SLUG);
      return await handler(req, guard, context);
    } catch (error) {
      if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof KeyringError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof AdminEnvError) return NextResponse.json({ error: "This can't be loaded right now. Try again in a few minutes." }, { status: 503 });
      throw error;
    }
  };
}

export async function auditKeyring(req: NextRequest, guard: Guard, action: string, summary: string, id?: string) {
  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action,
    actor: {
      uid: guard.actor.uid,
      adminId: guard.admin.id,
      name: guard.actor.name,
      email: guard.actor.email,
      role: guard.actor.roles[0] ?? "admin"
    },
    resource: { type: "e2ee_keyring", id, summary },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: req.nextUrl.pathname }
  });
}
