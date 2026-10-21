import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceIdSchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";
import { approveDevice } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ deviceId: string }> };

const bodySchema = z.object({
  wraps: z.array(wrapRecordSchema).min(1).max(10_000),
  via: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("device"), approverDeviceId: deviceIdSchema }),
    z.object({ kind: z.literal("recovery"), recoveryToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  ])
});

/** Activates a pending device with its copies of every epoch's workspace key. */
export const POST = e2eeRoute<Ctx>(async (req, guard, context) => {
  const { deviceId } = await context.params;
  if (!deviceIdSchema.safeParse(deviceId).success) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 2 * 1024 * 1024 });
  if (!parsed.ok) return parsed.response;
  await approveDevice({ approverUid: guard.actor.uid, deviceId, wraps: parsed.data.wraps, via: parsed.data.via });
  await auditKeyring(
    req,
    guard,
    parsed.data.via.kind === "recovery" ? "e2ee_device_recovered" : "e2ee_device_approved",
    parsed.data.via.kind === "recovery" ? "Device activated with the recovery key" : "Device approved",
    deviceId
  );
  return NextResponse.json({ ok: true });
});
