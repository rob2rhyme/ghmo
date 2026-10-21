import { NextResponse } from "next/server";
import { z } from "zod";
import { deviceIdSchema, publicJwkSchema } from "@/src/lib/e2ee/schemas";
import { registerDevice } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  deviceId: deviceIdSchema,
  name: z.string().trim().min(1).max(60),
  ecdhPublic: publicJwkSchema,
  ecdsaPublic: publicJwkSchema,
  unlock: z.enum(["prf", "passphrase"])
});

/** Registers this browser's public keys. It stays pending until approved. */
export const POST = e2eeRoute(async (req, guard) => {
  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 8 * 1024 });
  if (!parsed.ok) return parsed.response;
  await registerDevice({ ...parsed.data, uid: guard.actor.uid });
  await auditKeyring(req, guard, "e2ee_device_registered", parsed.data.name, parsed.data.deviceId);
  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
});
