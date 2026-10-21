import { NextResponse } from "next/server";
import { deviceIdSchema } from "@/src/lib/e2ee/schemas";
import { withdrawPendingDevice } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ deviceId: string }> };

/** Withdraws one of your own pending devices (active devices are revoked through rotation). */
export const DELETE = e2eeRoute<Ctx>(async (req, guard, context) => {
  const { deviceId } = await context.params;
  if (!deviceIdSchema.safeParse(deviceId).success) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  await withdrawPendingDevice(guard.actor.uid, deviceId);
  await auditKeyring(req, guard, "e2ee_device_withdrawn", "Pending device withdrawn", deviceId);
  return NextResponse.json({ ok: true });
});
