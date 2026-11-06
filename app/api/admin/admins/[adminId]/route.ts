import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/src/lib/admin";
import { listAdminAccounts, renameAdmin, setAdminRole, setAdminStatus } from "@/src/lib/adminManagement.server";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { removeDevicesOfAdmin } from "@/src/lib/push.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/admins/[adminId]";

/** One change at a time: the state, the role or the name (plan §22, D53 to D55). */
const patchSchema = z.union([
  z.object({ status: z.enum(["active", "disabled"]), removePushDevices: z.boolean().optional() }).strict(),
  z.object({ role: z.enum(["admin", "super_admin"]) }).strict(),
  z.object({ name: z.string().max(200) }).strict()
]);

/**
 * Turns an admin off or on, changes their role, or fixes their name. Super admin only. You can't turn yourself off or change
 * your own role, and the last active super admin can't be turned off or demoted (checked inside a transaction). Turning off
 * ends their access within about a minute; with `removePushDevices` it also turns off their push devices. Their encryption
 * devices are a separate step (the answer says so), because revoking them needs a super admin's unlocked device.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ adminId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { adminId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(adminId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = await parseJsonBody(req, patchSchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`admin-change:${actor.uid}`, 60, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of changes in an hour. Wait a little and try again." }, { status: 429 });
    }
    const now = new Date();
    const body = parsed.data;
    const base = { orgSlug: COMMUNITY_SLUG, actor: auditActor(actor, admin), meta: auditMeta(req, ROUTE) };

    if ("status" in body) {
      const result = await setAdminStatus({ targetId: adminId, actorId: actor.uid, status: body.status, now });
      if (!result.ok) return failureResponse(result);
      let pushDevicesRemoved = 0;
      if (result.changed && body.status === "disabled" && body.removePushDevices) pushDevicesRemoved = await removeDevicesOfAdmin(adminId);
      if (result.changed) {
        await logAuditEvent({
          ...base,
          action: body.status === "disabled" ? "admin_turned_off" : "admin_turned_on",
          resource: { type: "admin", id: adminId, summary: `${body.status === "disabled" ? "Admin turned off" : "Admin turned on"}: ${result.name}` },
          after: { name: result.name, status: body.status, ...(body.status === "disabled" ? { pushDevicesRemoved } : {}) }
        });
      }
      return NextResponse.json({ ok: true, changed: result.changed, pushDevicesRemoved, encryptionReminder: body.status === "disabled" && result.changed, admins: await listAdminAccounts(actor.uid) });
    }

    if ("role" in body) {
      const result = await setAdminRole({ targetId: adminId, actorId: actor.uid, role: body.role, now });
      if (!result.ok) return failureResponse(result);
      if (result.changed) {
        await logAuditEvent({
          ...base,
          action: "admin_role_changed",
          resource: { type: "admin", id: adminId, summary: `Admin role changed: ${result.name} is now ${body.role === "super_admin" ? "a super admin" : "an admin"}` },
          before: { role: result.before },
          after: { name: result.name, role: body.role }
        });
      }
      return NextResponse.json({ ok: true, changed: result.changed, admins: await listAdminAccounts(actor.uid) });
    }

    const result = await renameAdmin({ targetId: adminId, name: body.name, now });
    if (!result.ok) return failureResponse(result);
    if (result.before !== result.name) {
      await logAuditEvent({ ...base, action: "admin_renamed", resource: { type: "admin", id: adminId, summary: "Admin name fixed" }, before: { name: result.before }, after: { name: result.name } });
    }
    return NextResponse.json({ ok: true, admins: await listAdminAccounts(actor.uid) });
  } catch (error) {
    return routeError(error);
  }
}
