import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as overview } from "@/app/api/admin/e2ee/route";
import { POST as registerDevice } from "@/app/api/admin/e2ee/devices/route";
import { POST as approveDevice } from "@/app/api/admin/e2ee/devices/[deviceId]/approve/route";
import { GET as getWraps } from "@/app/api/admin/e2ee/wraps/route";
import { POST as bootstrap } from "@/app/api/admin/e2ee/bootstrap/route";
import { POST as rotate } from "@/app/api/admin/e2ee/rotate/route";
import { POST as replaceRecovery } from "@/app/api/admin/e2ee/recovery/route";
import {
  answerRecoveryCheck,
  bytesEqual,
  createRecoveryCheck,
  exportPublicJwk,
  fromBase64Url,
  generateDeviceKeys,
  generateRecoveryKey,
  importRecoveryPrivateKey,
  randomBytes,
  recoveryReplaceMessage,
  signBytes,
  toBase64Url,
  unwrapWithPrivateKey
} from "@/src/lib/e2ee";
import {
  createInitialEpoch,
  rotateEpoch,
  unwrapEpochKeys,
  wrapAllEpochsForDevice,
  wrapAllEpochsForRecovery,
  type DevicePublicRecord,
  type EpochKeys,
  type WrapRecord
} from "@/src/lib/e2ee/keyring";
import { issueCustomToken } from "@/src/lib/auth";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebaseAdmin";
import { exchangeCustomTokenForIdToken } from "@/src/lib/firebaseAuthRest";

const ORG = "organizations/ghmo";
const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;

async function clearEmulators() {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

const cookies = new Map<string, string>();
async function passkeySession(uid: string) {
  if (cookies.has(uid)) return cookies.get(uid)!;
  await getAdminAuth()
    .createUser({ uid })
    .catch(() => undefined);
  const idToken = await exchangeCustomTokenForIdToken(await issueCustomToken(uid, "admin", "passkey"));
  const cookie = await getAdminAuth().createSessionCookie(idToken!, { expiresIn: 60 * 60 * 1000 });
  cookies.set(uid, cookie);
  return cookie;
}

let ip = 0;
async function call<C>(
  handler: (req: NextRequest, ctx: C) => Promise<Response>,
  uid: string,
  path: string,
  body?: unknown,
  ctx?: C,
  method = body === undefined ? "GET" : "POST"
) {
  ip += 1;
  const req = new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `__session=${await passkeySession(uid)}`, "x-forwarded-for": `10.9.0.${ip % 250}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const res = await handler(req, ctx as C);
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

type Device = { id: string; uid: string; keys: Awaited<ReturnType<typeof generateDeviceKeys>>; record: DevicePublicRecord };

async function newDevice(uid: string, suffix: string): Promise<Device> {
  const keys = await generateDeviceKeys();
  const id = `${uid}-device-${suffix}`.padEnd(16, "x");
  const record: DevicePublicRecord = {
    deviceId: id,
    uid,
    name: `${uid} ${suffix}`,
    ecdhPublic: await exportPublicJwk(keys.ecdh.publicKey),
    ecdsaPublic: await exportPublicJwk(keys.ecdsa.publicKey),
    status: "active",
    unlock: "prf"
  };
  const res = await call(registerDevice, uid, "/api/admin/e2ee/devices", {
    deviceId: id,
    name: record.name,
    ecdhPublic: record.ecdhPublic,
    ecdsaPublic: record.ecdsaPublic,
    unlock: "prf"
  });
  expect(res.status).toBe(201);
  return { id, uid, keys, record };
}

const recoveryCheckFor = createRecoveryCheck;

async function wrapsFor(uid: string, recipient: string) {
  const res = await call(getWraps, uid, `/api/admin/e2ee/wraps?recipient=${recipient}`);
  return { status: res.status, wraps: (res.json.wraps ?? []) as WrapRecord[] };
}

const deviceCtx = (deviceId: string) => ({ params: Promise.resolve({ deviceId }) });

beforeEach(async () => {
  await clearEmulators();
  cookies.clear();
  const db = getAdminDb();
  await db.doc(`${ORG}/admins/alice`).set({ status: "active", emailLower: "alice@example.org", roles: ["super_admin"], name: "Alice" });
  await db.doc(`${ORG}/admins/bob`).set({ status: "active", emailLower: "bob@example.org", roles: ["admin"], name: "Bob" });
});

async function bootstrapWithAlice(deviceSuffix = "laptop") {
  const recovery = await generateRecoveryKey();
  const laptop = await newDevice("alice", deviceSuffix);
  const initial = await createInitialEpoch({ device: laptop.record, recoveryPublic: recovery.publicJwk });
  const res = await call(bootstrap, "alice", "/api/admin/e2ee/bootstrap", {
    deviceId: laptop.id,
    epoch: initial.epoch,
    wraps: initial.wraps,
    recoveryPublic: recovery.publicJwk,
    recoveryCheck: await recoveryCheckFor(recovery.publicJwk),
    trustees: [{ name: "Trustee One" }, { name: "Trustee Two" }],
    trusteesConfirmed: true
  });
  return { res, recovery, laptop, keys: initial.keys };
}

describe("E2EE keyring API", () => {
  it("bootstrap: super admin only, once, with two different trustees", async () => {
    const bobDevice = await newDevice("bob", "phone");
    const bobTry = await call(bootstrap, "bob", "/api/admin/e2ee/bootstrap", {
      deviceId: bobDevice.id,
      epoch: { epoch: 1 },
      wraps: [],
      trustees: [],
      trusteesConfirmed: true
    });
    expect(bobTry.status).toBe(403);

    const { res } = await bootstrapWithAlice();
    expect(res.status).toBe(201);

    const again = await bootstrapWithAlice("second-laptop");
    expect(again.res.status).toBe(409);

    const view = await call(overview, "bob", "/api/admin/e2ee");
    expect(view.json.state).toMatchObject({ enabled: true, currentEpoch: 1, trustees: [{ name: "Trustee One" }, { name: "Trustee Two" }] });
    expect(JSON.stringify(view.json)).not.toContain("tokenHash");
  });

  it("approval: a new device gets real copies of the workspace key; strangers can't fetch them", async () => {
    const { laptop, keys } = await bootstrapWithAlice();
    const bobPhone = await newDevice("bob", "phone");

    // Bob can't approve his own new device without an active device.
    const selfApprove = await call(
      approveDevice,
      "bob",
      `/api/admin/e2ee/devices/${bobPhone.id}/approve`,
      { wraps: await wrapAllEpochsForDevice(keys, bobPhone.record), via: { kind: "device", approverDeviceId: bobPhone.id } },
      deviceCtx(bobPhone.id)
    );
    expect(selfApprove.status).toBe(403);

    // Incomplete wraps are refused.
    const incomplete = await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${bobPhone.id}/approve`,
      { wraps: [{ ...(await wrapAllEpochsForDevice(keys, bobPhone.record))[0], epoch: 2 }], via: { kind: "device", approverDeviceId: laptop.id } },
      deviceCtx(bobPhone.id)
    );
    expect(incomplete.status).toBe(400);

    const approved = await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${bobPhone.id}/approve`,
      { wraps: await wrapAllEpochsForDevice(keys, bobPhone.record), via: { kind: "device", approverDeviceId: laptop.id } },
      deviceCtx(bobPhone.id)
    );
    expect(approved.status).toBe(200);

    const { wraps } = await wrapsFor("bob", bobPhone.id);
    const bobKeys = await unwrapEpochKeys(wraps, bobPhone.id, bobPhone.keys.ecdh.privateKey);
    expect(bytesEqual(bobKeys.get(1)!, keys.get(1)!)).toBe(true);

    expect((await wrapsFor("bob", laptop.id)).status).toBe(403);
  });

  it("rotation: must cover exactly the remaining active devices; revoked devices lose their wraps", async () => {
    const { laptop, keys, recovery } = await bootstrapWithAlice();
    const bobPhone = await newDevice("bob", "phone");
    await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${bobPhone.id}/approve`,
      { wraps: await wrapAllEpochsForDevice(keys, bobPhone.record), via: { kind: "device", approverDeviceId: laptop.id } },
      deviceCtx(bobPhone.id)
    );

    // Leaving Bob's phone in while "revoking" it is refused.
    const sloppy = await rotateEpoch({
      keys,
      createdByDevice: laptop.id,
      activeDevices: [laptop.record, bobPhone.record],
      recoveryPublic: recovery.publicJwk
    });
    const bad = await call(rotate, "alice", "/api/admin/e2ee/rotate", {
      byDeviceId: laptop.id,
      revokeDeviceIds: [bobPhone.id],
      epoch: sloppy.epoch,
      wraps: sloppy.wraps
    });
    expect(bad.status).toBe(400);

    // Bob (not super admin) can't revoke Alice's laptop.
    const bobRevoke = await call(rotate, "bob", "/api/admin/e2ee/rotate", {
      byDeviceId: bobPhone.id,
      revokeDeviceIds: [laptop.id],
      epoch: { ...sloppy.epoch, createdByDevice: bobPhone.id },
      wraps: []
    });
    expect(bobRevoke.status).toBe(400); // wraps missing -> schema; even with wraps it is 403 below

    const rotated = await rotateEpoch({
      keys,
      createdByDevice: laptop.id,
      activeDevices: [laptop.record, { ...bobPhone.record, status: "revoked" }],
      recoveryPublic: recovery.publicJwk
    });
    const ok = await call(rotate, "alice", "/api/admin/e2ee/rotate", {
      byDeviceId: laptop.id,
      revokeDeviceIds: [bobPhone.id],
      epoch: rotated.epoch,
      wraps: rotated.wraps
    });
    expect(ok.status).toBe(200);

    // A second rotation built on the stale epoch is refused.
    const stale = await call(rotate, "alice", "/api/admin/e2ee/rotate", {
      byDeviceId: laptop.id,
      revokeDeviceIds: [],
      epoch: rotated.epoch,
      wraps: rotated.wraps.filter(w => w.recipient !== bobPhone.id)
    });
    expect(stale.status).toBe(409);

    // Bob's revoked phone has no wraps left, and is refused by the wraps endpoint.
    expect((await wrapsFor("bob", bobPhone.id)).status).toBe(403);
    const remaining = await getAdminDb().collection(`${ORG}/e2ee/state/wraps`).where("recipient", "==", bobPhone.id).get();
    expect(remaining.empty).toBe(true);
  });

  it("non-super admins cannot revoke other admins' devices", async () => {
    const { laptop, keys, recovery } = await bootstrapWithAlice();
    const bobPhone = await newDevice("bob", "phone");
    await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${bobPhone.id}/approve`,
      { wraps: await wrapAllEpochsForDevice(keys, bobPhone.record), via: { kind: "device", approverDeviceId: laptop.id } },
      deviceCtx(bobPhone.id)
    );
    const rotated = await rotateEpoch({
      keys,
      createdByDevice: bobPhone.id,
      activeDevices: [bobPhone.record, { ...laptop.record, status: "revoked" }],
      recoveryPublic: recovery.publicJwk
    });
    const res = await call(rotate, "bob", "/api/admin/e2ee/rotate", {
      byDeviceId: bobPhone.id,
      revokeDeviceIds: [laptop.id],
      epoch: rotated.epoch,
      wraps: rotated.wraps
    });
    expect(res.status).toBe(403);
  });

  it("recovery: the paper key activates a new device; a wrong token or someone else's device is refused", async () => {
    const { recovery, laptop } = await bootstrapWithAlice();
    const newLaptop = await newDevice("alice", "newlaptop");

    // Recover: unwrap every epoch with the paper key, prove possession, wrap for the new device.
    const recoveryPrivate = await importRecoveryPrivateKey(recovery.printable, recovery.publicJwk);
    const recoveredKeys: EpochKeys = await unwrapEpochKeys((await wrapsFor("alice", "recovery")).wraps, "recovery", recoveryPrivate);
    const view = await call(overview, "alice", "/api/admin/e2ee");
    const checkWrap = (view.json.state as { recoveryCheckWrap: Parameters<typeof unwrapWithPrivateKey>[0] }).recoveryCheckWrap;
    const token = await answerRecoveryCheck(checkWrap, recoveryPrivate);
    const wraps = await wrapAllEpochsForDevice(recoveredKeys, newLaptop.record);

    const wrongToken = await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${newLaptop.id}/approve`,
      { wraps, via: { kind: "recovery", recoveryToken: toBase64Url(randomBytes(32)) } },
      deviceCtx(newLaptop.id)
    );
    expect(wrongToken.status).toBe(403);

    const bobDevice = await newDevice("bob", "tablet");
    const othersDevice = await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${bobDevice.id}/approve`,
      { wraps: await wrapAllEpochsForDevice(recoveredKeys, bobDevice.record), via: { kind: "recovery", recoveryToken: token } },
      deviceCtx(bobDevice.id)
    );
    expect(othersDevice.status).toBe(403);

    const ok = await call(
      approveDevice,
      "alice",
      `/api/admin/e2ee/devices/${newLaptop.id}/approve`,
      { wraps, via: { kind: "recovery", recoveryToken: token } },
      deviceCtx(newLaptop.id)
    );
    expect(ok.status).toBe(200);
    expect(fromBase64Url(token)).toHaveLength(32);

    // Then the recovery key is replaced; the old paper copy no longer opens the stored wraps.
    const fresh = await generateRecoveryKey();
    const body = async (deviceId: string, issuedAt: number, signer: CryptoKey) => ({
      recoveryPublic: fresh.publicJwk,
      recoveryCheck: await recoveryCheckFor(fresh.publicJwk),
      wraps: await wrapAllEpochsForRecovery(recoveredKeys, fresh.publicJwk),
      trustees: [{ name: "Trustee Three" }, { name: "Trustee Four" }],
      trusteesConfirmed: true,
      authorization: { deviceId, issuedAt, sig: await signBytes(signer, recoveryReplaceMessage(deviceId, issuedAt, fresh.publicJwk)) }
    });
    const signer = laptop.keys.ecdsa.privateKey;
    const replace = (b: unknown) => call(replaceRecovery, "alice", "/api/admin/e2ee/recovery", b);

    // A stolen session cookie isn't enough: the change must be signed by one of the admin's active devices.
    const unsigned = { ...(await body(laptop.id, Date.now(), signer)), authorization: undefined };
    expect((await replace(unsigned)).status).toBe(400);
    expect((await replace(await body(laptop.id, Date.now() - 10 * 60 * 1000, signer))).status).toBe(403);
    expect((await replace(await body(laptop.id, Date.now(), (await generateDeviceKeys()).ecdsa.privateKey))).status).toBe(403);
    const forOtherDevice = await body("some-other-device-00001", Date.now(), signer);
    expect((await replace(forOtherDevice)).status).toBe(403);
    expect(((await wrapsFor("alice", "recovery")).wraps)).toHaveLength(1);

    const replaced = await replace(await body(laptop.id, Date.now(), signer));
    expect(replaced.status).toBe(200);
    const stored = (await wrapsFor("alice", "recovery")).wraps;
    await expect(unwrapEpochKeys(stored, "recovery", recoveryPrivate)).rejects.toThrow();
    const freshPrivate = await importRecoveryPrivateKey(fresh.printable, fresh.publicJwk);
    expect((await unwrapEpochKeys(stored, "recovery", freshPrivate)).size).toBe(1);
  });
});
