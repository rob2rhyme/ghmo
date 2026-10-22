import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/src/lib/admin";
import { deviceIdSchema, epochRecordSchema, rosterEntrySchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";
import { rotate } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  byDeviceId: deviceIdSchema,
  revokeDeviceIds: z.array(deviceIdSchema).max(50),
  epoch: epochRecordSchema,
  wraps: z.array(wrapRecordSchema).min(1).max(500),
  entry: rosterEntrySchema.optional()
});

/** Starts a new epoch, optionally revoking devices (lost phone, admin leaving). */
export const POST = e2eeRoute(async (req, guard) => {
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 512 * 1024 });
  if (!parsed.ok) return parsed.response;
  await rotate({ uid: guard.actor.uid, ...parsed.data, canRevokeOthers: isSuperAdmin(guard.admin) });
  await auditKeyring(
    req,
    guard,
    "e2ee_rotated",
    `Rotated to epoch ${parsed.data.epoch.epoch}; revoked ${parsed.data.revokeDeviceIds.length} device(s)`,
    String(parsed.data.epoch.epoch)
  );
  return NextResponse.json({ ok: true, epoch: parsed.data.epoch.epoch });
});
