import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/src/lib/admin";
import { publicJwkSchema, recoveryCheckSchema, trusteeSchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";
import { RECOVERY_REPLACE_MAX_AGE_MS, recoveryReplaceMessage, verifyBytes } from "@/src/lib/e2ee";
import { listDevices, replaceRecoveryKey } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  recoveryPublic: publicJwkSchema,
  recoveryCheck: recoveryCheckSchema,
  wraps: z.array(wrapRecordSchema).min(1).max(10_000),
  trustees: z.array(trusteeSchema).length(2),
  trusteesConfirmed: z.literal(true),
  // Signed by one of the caller's active devices over the new recovery key (see recoveryReplaceMessage).
  authorization: z.object({ deviceId: z.string().max(64), issuedAt: z.number().int(), sig: z.string().max(200) })
});

/** Replaces the recovery key (super admin). Old paper copies stop working for new epochs. */
export const POST = e2eeRoute(async (req, guard) => {
  if (!isSuperAdmin(guard.admin)) return NextResponse.json({ error: "Only a super admin can replace the recovery key" }, { status: 403 });
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 2 * 1024 * 1024 });
  if (!parsed.ok) return parsed.response;
  const { authorization, ...replacement } = parsed.data;
  const device = (await listDevices()).find(d => d.deviceId === authorization.deviceId && d.uid === guard.actor.uid && d.status === "active");
  const fresh = Math.abs(Date.now() - authorization.issuedAt) <= RECOVERY_REPLACE_MAX_AGE_MS;
  const signed =
    device && fresh
      ? await verifyBytes(device.ecdsaPublic, authorization.sig, recoveryReplaceMessage(device.deviceId, authorization.issuedAt, replacement.recoveryPublic)).catch(() => false)
      : false;
  if (!signed) {
    return NextResponse.json({ error: "Approve the change from one of your unlocked devices (the approval is missing, stale or invalid)." }, { status: 403 });
  }
  await replaceRecoveryKey(replacement);
  await auditKeyring(req, guard, "e2ee_recovery_replaced", `Recovery key replaced; held by ${parsed.data.trustees.map(t => t.name).join(" and ")}`);
  return NextResponse.json({ ok: true });
});
