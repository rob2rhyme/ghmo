import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/src/lib/admin";
import { publicJwkSchema, recoveryCheckSchema, trusteeSchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";
import { replaceRecoveryKey } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  recoveryPublic: publicJwkSchema,
  recoveryCheck: recoveryCheckSchema,
  wraps: z.array(wrapRecordSchema).min(1).max(10_000),
  trustees: z.array(trusteeSchema).length(2),
  trusteesConfirmed: z.literal(true)
});

/** Replaces the recovery key (super admin). Old paper copies stop working for new epochs. */
export const POST = e2eeRoute(async (req, guard) => {
  if (!isSuperAdmin(guard.admin)) return NextResponse.json({ error: "Only a super admin can replace the recovery key" }, { status: 403 });
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 2 * 1024 * 1024 });
  if (!parsed.ok) return parsed.response;
  await replaceRecoveryKey(parsed.data);
  await auditKeyring(req, guard, "e2ee_recovery_replaced", `Recovery key replaced; held by ${parsed.data.trustees.map(t => t.name).join(" and ")}`);
  return NextResponse.json({ ok: true });
});
