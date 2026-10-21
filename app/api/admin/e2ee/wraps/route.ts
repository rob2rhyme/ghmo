import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceIdSchema } from "@/src/lib/e2ee/schemas";
import { listDevices, listWraps } from "@/src/lib/e2eeStore";
import { e2eeRoute } from "@/src/lib/e2eeRoute";

export const dynamic = "force-dynamic";

const recipientSchema = z.union([deviceIdSchema, z.literal("recovery")]);

/**
 * Wrapped workspace keys for one recipient: one of your own active devices, or
 * "recovery" (useless without the paper key). Ciphertext only.
 */
export const GET = e2eeRoute(async (req, guard) => {
  const recipient = req.nextUrl.searchParams.get("recipient") ?? "";
  if (!recipientSchema.safeParse(recipient).success) return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  if (recipient !== "recovery") {
    const device = (await listDevices()).find(d => d.deviceId === recipient);
    if (!device || device.uid !== guard.actor.uid || device.status !== "active") {
      return NextResponse.json({ error: "Not one of your active devices" }, { status: 403 });
    }
  }
  return NextResponse.json({ wraps: await listWraps(recipient) });
});
