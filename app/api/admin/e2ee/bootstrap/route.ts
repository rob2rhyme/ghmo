import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/src/lib/admin";
import { deviceIdSchema, epochRecordSchema, publicJwkSchema, recoveryCheckSchema, trusteeSchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";
import { bootstrap } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  deviceId: deviceIdSchema,
  epoch: epochRecordSchema,
  wraps: z.array(wrapRecordSchema).length(2),
  recoveryPublic: publicJwkSchema,
  recoveryCheck: recoveryCheckSchema,
  trustees: z.array(trusteeSchema).length(2),
  trusteesConfirmed: z.literal(true)
});

/** Turns on end-to-end encryption (super admin, once). */
export const POST = e2eeRoute(async (req, guard) => {
  if (!isSuperAdmin(guard.admin)) return NextResponse.json({ error: "Only a super admin can set up encryption" }, { status: 403 });
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 32 * 1024 });
  if (!parsed.ok) return parsed.response;
  await bootstrap({ uid: guard.actor.uid, ...parsed.data });
  await auditKeyring(
    req,
    guard,
    "e2ee_enabled",
    `End-to-end encryption enabled; recovery key held by ${parsed.data.trustees.map(t => t.name).join(" and ")}`
  );
  return NextResponse.json({ ok: true }, { status: 201 });
});
