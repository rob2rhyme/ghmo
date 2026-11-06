import "server-only";

import crypto from "node:crypto";
import https from "node:https";
import webpush from "web-push";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgAdminsCollectionPath, orgPushSubscriptionsCollectionPath } from "./firestorePaths";
import { checkRateLimit } from "./rateLimit";
import {
  MAX_DEVICES_PER_ADMIN,
  PUSH_THROTTLE_MS,
  PUSH_TTL_SECONDS,
  isAllowedPushEndpoint,
  pickPushTargets,
  pushPayload,
  type PushDevice,
  type PushKind,
  type PushKeys
} from "./push";
import { fail, type Failure } from "./adminRoute.server";

/**
 * Web Push storage and sending (plan §18, Phase 14). Server-only: the rules let nobody read or write
 * `organizations/ghmo/pushSubscriptions`, because a device record holds a secret address and keys. A person sees only
 * their own devices, through the API, and without the address.
 *
 * Sending is best effort: it never throws and never blocks the action that caused it.
 */
const subsCol = () => getAdminDb().collection(orgPushSubscriptionsCollectionPath(COMMUNITY_SLUG));
const adminsCol = () => getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG));

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

/** The VAPID key pair and contact, or null until all three are set in the environment. */
export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return null;
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  return { publicKey, privateKey, subject };
}

/**
 * The browser tests use a local stub with a throwaway certificate. This is on only in the emulator test build, never
 * on a production deployment.
 */
function testStub(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUSH_TEST_ALLOW_INSECURE === "true" && env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && env.VERCEL_ENV !== "production";
}
const testHosts = (): readonly string[] => (testStub() ? ["127.0.0.1"] : []);
export const endpointAllowed = (endpoint: unknown) => isAllowedPushEndpoint(endpoint, testHosts());

/** The same device always maps to the same record, so subscribing twice is harmless. */
export const deviceId = (endpoint: string) => crypto.createHash("sha256").update(endpoint, "utf8").digest("hex").slice(0, 32);

export type DeviceView = { id: string; label: string; kinds: string[]; createdAt: number | null; lastSentAt: number | null };

const millis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const stamp = value as { toMillis?: () => number } | null | undefined;
  return typeof stamp?.toMillis === "function" ? stamp.toMillis() : null;
};

export async function listDevices(uid: string): Promise<DeviceView[]> {
  const snap = await subsCol().where("uid", "==", uid).get();
  return snap.docs
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        label: (data.label as string) || "This device",
        kinds: Array.isArray(data.kinds) ? (data.kinds as string[]) : [],
        createdAt: millis(data.createdAt),
        lastSentAt: millis(data.lastSentAt)
      };
    })
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export async function addDevice(input: { uid: string; keys: PushKeys; label: string; kinds: string[]; now: Date }): Promise<{ ok: true; id: string } | Failure> {
  if (!endpointAllowed(input.keys.endpoint)) return fail(400, "This browser's notification service isn't one this site can send to.");
  const id = deviceId(input.keys.endpoint);
  const ref = subsCol().doc(id);
  const mine = await subsCol().where("uid", "==", input.uid).get();
  if (!mine.docs.some(doc => doc.id === id) && mine.size >= MAX_DEVICES_PER_ADMIN) {
    return fail(409, `You already have ${MAX_DEVICES_PER_ADMIN} devices switched on. Turn one off first.`);
  }
  const existing = await ref.get();
  await ref.set({
    uid: input.uid,
    endpoint: input.keys.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    label: input.label,
    kinds: input.kinds,
    createdAt: existing.exists ? (existing.get("createdAt") ?? input.now) : input.now,
    updatedAt: input.now,
    lastSentAt: null
  });
  return { ok: true, id };
}

/** Changes the kinds on one of this admin's own devices. */
export async function updateDeviceKinds(uid: string, id: string, kinds: string[], now: Date = new Date()): Promise<{ ok: true } | Failure> {
  const ref = subsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("uid") !== uid) return fail(404, "That device isn't switched on.");
  await ref.update({ kinds, updatedAt: now });
  return { ok: true };
}

/** Turns push off for one of this admin's own devices. */
export async function removeDevice(uid: string, id: string): Promise<{ ok: true } | Failure> {
  const ref = subsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("uid") !== uid) return fail(404, "That device isn't switched on.");
  await ref.delete();
  return { ok: true };
}

function toDevice(id: string, data: Record<string, unknown>): PushDevice {
  return {
    id,
    uid: String(data.uid ?? ""),
    endpoint: String(data.endpoint ?? ""),
    p256dh: String(data.p256dh ?? ""),
    auth: String(data.auth ?? ""),
    kinds: Array.isArray(data.kinds) ? (data.kinds as string[]) : []
  };
}

/** Sends one device its notification. Returns whether the push service accepted it; a gone device is deleted. */
async function sendTo(config: PushConfig, device: PushDevice, kind: PushKind): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(pushPayload(kind)), {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: PUSH_TTL_SECONDS,
      urgency: "normal",
      // A newer notification of the same kind replaces an older one the push service is still holding.
      topic: kind,
      timeout: 8000,
      ...(testStub() ? { agent: new https.Agent({ rejectUnauthorized: false }) } : {})
    });
    await subsCol().doc(device.id).update({ lastSentAt: new Date() });
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await subsCol().doc(device.id).delete().catch(() => undefined);
    } else {
      console.error("Push failed", status ?? (error instanceof Error ? error.name : "unknown"));
    }
    return false;
  }
}

/**
 * Pushes the same content-free alert the email carries, to the devices that switched it on (D33, D34): not the person
 * who caused it, at most one push per person per kind a minute, only active admins. Returns how many devices accepted.
 */
export async function sendPushNotifications(kind: PushKind, actorUid: string, onlyUids?: string[]): Promise<number> {
  const config = pushConfig();
  if (!config) return 0;
  try {
    const [deviceSnap, adminSnap] = await Promise.all([subsCol().get(), adminsCol().get()]);
    const admins = new Map(adminSnap.docs.map(doc => [doc.id, { status: doc.get("status") as string | undefined }]));
    const targets = pickPushTargets({
      devices: deviceSnap.docs.map(doc => toDevice(doc.id, doc.data())),
      admins,
      actorUid,
      kind,
      onlyUids,
      testHosts: testHosts()
    });
    let sent = 0;
    const throttled = new Map<string, boolean>();
    for (const device of targets) {
      if (!throttled.has(device.uid)) {
        throttled.set(device.uid, (await checkRateLimit(`push:${device.uid}:${kind}`, 1, PUSH_THROTTLE_MS)).success);
      }
      if (!throttled.get(device.uid)) continue;
      if (await sendTo(config, device, kind)) sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("Push notification failed", error instanceof Error ? error.name : "unknown");
    return 0;
  }
}
