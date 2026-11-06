import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, failureResponse, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listAllDevices, removeAnyDevice } from "@/src/lib/push.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/push-devices/[deviceId]";

/**
 * Turns off any admin's push device (plan §21, D48), for example a lost phone. Super admin only. The activity entry holds
 * the device id, whose it was and its name, never its address. The owner can switch it on again from that device.
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ deviceId: string }> }) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireSuperAdmin(req, COMMUNITY_SLUG);
    const { deviceId } = await context.params;
    if (!/^[a-f0-9]{32}$/.test(deviceId)) return NextResponse.json({ error: "Device not found" }, { status: 404 });
    const result = await removeAnyDevice(deviceId);
    if (!result.ok) return failureResponse(result);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "push_device_removed",
      actor: auditActor(actor, admin),
      resource: { type: "pushDevice", id: deviceId, summary: `Push device turned off: ${result.label}` },
      after: { ownerUid: result.uid, label: result.label },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true, devices: await listAllDevices() });
  } catch (error) {
    return routeError(error);
  }
}
