import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { failureResponse } from "@/src/lib/adminRoute.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { PUSH_KINDS, cleanKinds, cleanSubscription, deviceLabel } from "@/src/lib/push";
import { addDevice, deviceId, listDevices, pushConfig, readPushSettings, removeDevice, updateDeviceKinds } from "@/src/lib/push.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Your own push-notification devices (plan §18). Any active admin, for themselves only: a person can list, add, change
 * and remove their own devices and nobody else's. The device's secret address and keys never come back out.
 */
export async function GET(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const config = pushConfig();
  return NextResponse.json({
    configured: Boolean(config),
    // A super admin can switch push off for the whole site (plan §21); every admin sees that here.
    siteEnabled: (await readPushSettings()).enabled,
    publicKey: config?.publicKey ?? null,
    kinds: PUSH_KINDS,
    devices: await listDevices(guard.actor.uid)
  });
}

const subscribeSchema = z.object({
  subscription: z.object({ endpoint: z.string().max(2048), keys: z.object({ p256dh: z.string().max(128), auth: z.string().max(64) }) }),
  kinds: z.array(z.string().max(32)).max(10).optional()
});

export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  if (!pushConfig()) return NextResponse.json({ error: "Push notifications aren't set up on this site yet." }, { status: 503 });
  const parsed = await parseJsonBody(req, subscribeSchema);
  if (!parsed.ok) return parsed.response;
  const keys = cleanSubscription(parsed.data.subscription);
  if (!keys) return NextResponse.json({ error: "This browser sent notification details that look wrong. Try again." }, { status: 400 });
  if (!(await checkRateLimit(`push-add:${guard.actor.uid}`, 20, 60 * 60 * 1000)).success) {
    return NextResponse.json({ error: "Too many tries. Wait a little and try again." }, { status: 429 });
  }
  const result = await addDevice({
    uid: guard.actor.uid,
    keys,
    label: deviceLabel(req.headers.get("user-agent")),
    kinds: cleanKinds(parsed.data.kinds),
    now: new Date()
  });
  if (!result.ok) return failureResponse(result);
  return NextResponse.json({ ok: true, id: result.id, devices: await listDevices(guard.actor.uid) });
}

const patchSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), kinds: z.array(z.string().max(32)).max(10) });

export async function PATCH(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const parsed = await parseJsonBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const result = await updateDeviceKinds(guard.actor.uid, parsed.data.id, cleanKinds(parsed.data.kinds));
  if (!result.ok) return failureResponse(result);
  return NextResponse.json({ ok: true, devices: await listDevices(guard.actor.uid) });
}

/** Turns push off for one device, named by its id or by the address the browser is using (so a browser can unsubscribe itself). */
const deleteSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/).optional(), endpoint: z.string().max(2048).optional() }).refine(value => value.id || value.endpoint);

export async function DELETE(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const parsed = await parseJsonBody(req, deleteSchema);
  if (!parsed.ok) return parsed.response;
  const id = parsed.data.id ?? deviceId(parsed.data.endpoint as string);
  const result = await removeDevice(guard.actor.uid, id);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json({ ok: true, devices: await listDevices(guard.actor.uid) });
}
