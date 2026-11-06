import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { addAdmin, listAdminAccounts } from "@/src/lib/adminManagement.server";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/admins";

/** Everyone on the admin list (plan §22). Super admin only. */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json({ admins: await listAdminAccounts(actor.uid) });
  } catch (error) {
    return routeError(error);
  }
}

const addSchema = z.object({ name: z.string().max(200), email: z.string().max(400), role: z.enum(["admin", "super_admin"]) }).strict();

/**
 * Adds an admin (D52): an active record from a name, an email and a role. Nothing is emailed; the person opens the sign-in
 * page, enters that email and follows the normal steps. The activity entry holds the id, name and role, never the email.
 */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, addSchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`admin-add:${actor.uid}`, 20, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of changes in an hour. Wait a little and try again." }, { status: 429 });
    }
    const result = await addAdmin({ ...parsed.data, actorUid: actor.uid, now: new Date() });
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "admin_added",
      actor: auditActor(actor, admin),
      resource: { type: "admin", id: result.id, summary: `Admin added: ${result.name} (${result.role === "super_admin" ? "super admin" : "admin"})` },
      after: { name: result.name, role: result.role },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, id: result.id, admins: await listAdminAccounts(actor.uid) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
