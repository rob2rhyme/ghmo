import { describe, expect, it } from "vitest";
import {
  aesKeyFromRaw,
  decryptRecord,
  encryptRecord,
  exportPublicJwk,
  generateDeviceKeys,
  generateRecoveryKey,
  importRecoveryPrivateKey,
  type PublicJwk
} from "@/src/lib/e2ee";
import {
  createInitialEpoch,
  currentEpoch,
  RECOVERY_RECIPIENT,
  rotateEpoch,
  unwrapEpochKeys,
  wrapAllEpochsForDevice,
  wrapAllEpochsForRecovery,
  type DevicePublicRecord,
  type EpochKeys,
  type WrapRecord
} from "@/src/lib/e2ee/keyring";

async function makeDevice(deviceId: string, uid: string) {
  const keys = await generateDeviceKeys();
  const record: DevicePublicRecord = {
    deviceId,
    uid,
    name: deviceId,
    ecdhPublic: await exportPublicJwk(keys.ecdh.publicKey),
    ecdsaPublic: await exportPublicJwk(keys.ecdsa.publicKey),
    status: "active",
    unlock: "prf"
  };
  return { keys, record };
}

const LOCATION = { path: "organizations/ghmo/adminChatMessages", docId: "m" };

async function write(device: Awaited<ReturnType<typeof makeDevice>>, keys: EpochKeys, body: string, docId: string) {
  const epoch = currentEpoch(keys);
  return encryptRecord({
    data: { body },
    location: { ...LOCATION, docId },
    epoch,
    workspaceKey: await aesKeyFromRaw(keys.get(epoch)!),
    deviceId: device.record.deviceId,
    signingKey: device.keys.ecdsa.privateKey
  });
}

function reader(keys: EpochKeys, signers: Record<string, PublicJwk>) {
  return {
    workspaceKeyFor: async (epoch: number) => (keys.has(epoch) ? aesKeyFromRaw(keys.get(epoch)!) : null),
    signingKeyFor: (dev: string) => signers[dev] ?? null
  };
}

describe("E2EE lifecycle (plan Phase 3 exit criteria)", () => {
  it("bootstrap -> approve second device -> revoke + rotate -> recovery drill", async () => {
    const store: WrapRecord[] = [];
    const recovery = await generateRecoveryKey();

    // 1. Alice bootstraps on her laptop.
    const aliceLaptop = await makeDevice("alice-laptop-000001", "alice");
    const initial = await createInitialEpoch({ device: aliceLaptop.record, recoveryPublic: recovery.publicJwk });
    store.push(...initial.wraps);
    let aliceKeys = await unwrapEpochKeys(store, "alice-laptop-000001", aliceLaptop.keys.ecdh.privateKey);
    expect(currentEpoch(aliceKeys)).toBe(1);
    const msg1 = await write(aliceLaptop, aliceKeys, "epoch 1 secret", "m1");

    // 2. Bob enrolls his phone; Alice approves it by wrapping every epoch for it.
    const bobPhone = await makeDevice("bob-phone-00000001", "bob");
    store.push(...(await wrapAllEpochsForDevice(aliceKeys, bobPhone.record)));
    const bobKeys = await unwrapEpochKeys(store, "bob-phone-00000001", bobPhone.keys.ecdh.privateKey);
    const signers = { "alice-laptop-000001": aliceLaptop.record.ecdsaPublic, "bob-phone-00000001": bobPhone.record.ecdsaPublic };
    expect(await decryptRecord(msg1, { ...LOCATION, docId: "m1" }, reader(bobKeys, signers))).toEqual({ body: "epoch 1 secret" });

    // 3. Bob's phone is lost: revoke it and rotate to epoch 2 (wrapped for Alice + recovery only).
    const rotated = await rotateEpoch({
      keys: aliceKeys,
      createdByDevice: "alice-laptop-000001",
      activeDevices: [aliceLaptop.record, { ...bobPhone.record, status: "revoked" }],
      recoveryPublic: recovery.publicJwk
    });
    expect(rotated.wraps.map(w => w.recipient).sort()).toEqual(["alice-laptop-000001", RECOVERY_RECIPIENT]);
    store.push(...rotated.wraps);
    aliceKeys = rotated.keys;
    const msg2 = await write(aliceLaptop, aliceKeys, "epoch 2 secret", "m2");

    // The lost phone can't read anything new.
    const bobAfter = await unwrapEpochKeys(store, "bob-phone-00000001", bobPhone.keys.ecdh.privateKey);
    expect(bobAfter.has(2)).toBe(false);
    await expect(decryptRecord(msg2, { ...LOCATION, docId: "m2" }, reader(bobAfter, signers))).rejects.toThrow(/No key for epoch 2/);

    // 4. Recovery drill: with only the paper key, every epoch comes back.
    const recoveryPrivate = await importRecoveryPrivateKey(recovery.printable, recovery.publicJwk);
    const recovered = await unwrapEpochKeys(store, RECOVERY_RECIPIENT, recoveryPrivate);
    expect([...recovered.keys()].sort()).toEqual([1, 2]);
    expect(await decryptRecord(msg1, { ...LOCATION, docId: "m1" }, reader(recovered, signers))).toEqual({ body: "epoch 1 secret" });
    expect(await decryptRecord(msg2, { ...LOCATION, docId: "m2" }, reader(recovered, signers))).toEqual({ body: "epoch 2 secret" });

    // 5. After using it, the recovery key is replaced: every epoch is rewrapped to the new one.
    const newRecovery = await generateRecoveryKey();
    const recoveryWraps = await wrapAllEpochsForRecovery(recovered, newRecovery.publicJwk);
    const newPrivate = await importRecoveryPrivateKey(newRecovery.printable, newRecovery.publicJwk);
    expect([...(await unwrapEpochKeys(recoveryWraps, RECOVERY_RECIPIENT, newPrivate)).keys()].sort()).toEqual([1, 2]);
  });

  it("rotation never includes pending or revoked devices", async () => {
    const recovery = await generateRecoveryKey();
    const a = await makeDevice("device-aaaaaaaaaaaa", "a");
    const pending = await makeDevice("device-pppppppppppp", "p");
    const revoked = await makeDevice("device-rrrrrrrrrrrr", "r");
    const initial = await createInitialEpoch({ device: a.record, recoveryPublic: recovery.publicJwk });
    const rotated = await rotateEpoch({
      keys: initial.keys,
      createdByDevice: a.record.deviceId,
      activeDevices: [a.record, { ...pending.record, status: "pending" }, { ...revoked.record, status: "revoked" }],
      recoveryPublic: recovery.publicJwk
    });
    expect(rotated.epoch.epoch).toBe(2);
    expect(rotated.wraps.map(w => w.recipient).sort()).toEqual([a.record.deviceId, RECOVERY_RECIPIENT].sort());
  });
});
