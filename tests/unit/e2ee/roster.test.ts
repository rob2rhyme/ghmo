import { describe, expect, it } from "vitest";
import {
  RECOVERY_SIGNER,
  RosterError,
  addEntry,
  checkPin,
  checkServerAgainstRoster,
  checkWrapsAgainstRoster,
  entryHash,
  exportPublicJwk,
  generateDeviceKeys,
  generateRecoveryKey,
  genesisEntry,
  keyringFromOverview,
  importRecoverySigningKey,
  recoveryEntry,
  rosterDevice,
  rotateEntry,
  signEntry,
  verifyRoster,
  workspaceFingerprint,
  type PublicJwk,
  type RosterEntry,
  type ServerKeyring
} from "@/src/lib/e2ee";
import {
  RECOVERY_RECIPIENT,
  createInitialEpoch,
  rotateEpoch,
  wrapAllEpochsForDevice,
  wrapAllEpochsForRecovery,
  type DevicePublicRecord,
  type EpochKeys,
  type EpochRecord,
  type WrapRecord
} from "@/src/lib/e2ee/keyring";

type Dev = { record: DevicePublicRecord; keys: Awaited<ReturnType<typeof generateDeviceKeys>> };

async function makeDevice(deviceId: string, uid: string): Promise<Dev> {
  const keys = await generateDeviceKeys();
  return {
    keys,
    record: {
      deviceId,
      uid,
      name: deviceId,
      ecdhPublic: await exportPublicJwk(keys.ecdh.publicKey),
      ecdsaPublic: await exportPublicJwk(keys.ecdsa.publicKey),
      status: "active",
      unlock: "prf"
    }
  };
}
const signer = (d: Dev) => ({ id: d.record.deviceId, key: d.keys.ecdsa.privateKey });

/** A small workspace driven through the same builders the browser uses. */
async function workspace() {
  const alice = await makeDevice("alice-laptop-00001", "alice");
  const recovery = await generateRecoveryKey();
  const initial = await createInitialEpoch({ device: alice.record, recoveryPublic: recovery.publicJwk });
  const log: RosterEntry[] = [
    await genesisEntry({
      signer: signer(alice),
      devices: [rosterDevice(alice.record)],
      recovery: recovery.publicJwk,
      epochs: [{ epoch: 1, sealingPublic: initial.epoch.sealingPublic }],
      wraps: initial.wraps
    })
  ];
  const wraps: WrapRecord[] = [...initial.wraps];
  const epochs: EpochRecord[] = [initial.epoch];
  let keys: EpochKeys = initial.keys;
  const devices = [alice];
  let recoveryPublic = recovery.publicJwk;

  const approve = async (d: Dev, by: Dev = alice) => {
    const w = await wrapAllEpochsForDevice(keys, d.record);
    log.push(await addEntry({ log, signer: signer(by), device: rosterDevice(d.record), wraps: w }));
    wraps.push(...w);
    devices.push(d);
  };
  const rotate = async (revoke: string[], by: Dev = alice) => {
    const remaining = devices.filter(d => !revoke.includes(d.record.deviceId));
    const r = await rotateEpoch({ keys, createdByDevice: by.record.deviceId, activeDevices: remaining.map(d => d.record), recoveryPublic });
    log.push(
      await rotateEntry({
        log,
        signer: signer(by),
        epoch: r.epoch.epoch,
        sealingPublic: r.epoch.sealingPublic,
        revoked: revoke,
        remaining: remaining.map(d => d.record.deviceId),
        wraps: r.wraps
      })
    );
    for (const id of revoke) {
      devices.splice(devices.findIndex(d => d.record.deviceId === id), 1);
      for (let i = wraps.length - 1; i >= 0; i--) if (wraps[i].recipient === id) wraps.splice(i, 1);
    }
    wraps.push(...r.wraps);
    epochs.push(r.epoch);
    keys = r.keys;
  };
  const server = (): ServerKeyring => ({
    devices: devices.map(d => ({ deviceId: d.record.deviceId, uid: d.record.uid, status: "active", ecdhPublic: d.record.ecdhPublic, ecdsaPublic: d.record.ecdsaPublic })),
    recoveryPublic,
    currentEpoch: epochs.length,
    epochs: epochs.map(e => ({ epoch: e.epoch, sealingPublic: e.sealingPublic }))
  });
  return { alice, recovery, log, wraps, epochs, devices, approve, rotate, server, keysNow: () => keys, setRecovery: (k: PublicJwk) => (recoveryPublic = k), getKeys: () => keys };
}

const fails = async (log: RosterEntry[], match: RegExp) => {
  await expect(verifyRoster(log)).rejects.toThrow(RosterError);
  await expect(verifyRoster(log)).rejects.toThrow(match);
};

describe("roster: an honest history", () => {
  it("verifies through bootstrap, approval, rotation with revocation, and a recovery-key change", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await ws.rotate([bob.record.deviceId]);

    const newRecovery = await generateRecoveryKey();
    ws.log.push(await recoveryEntry({ log: ws.log, signer: signer(ws.alice), recovery: newRecovery.publicJwk, wraps: await wrapAllEpochsForRecovery(ws.getKeys(), newRecovery.publicJwk) }));
    ws.setRecovery(newRecovery.publicJwk);

    const state = await verifyRoster(ws.log);
    expect(state.currentEpoch).toBe(2);
    expect([...state.devices.keys()]).toEqual([ws.alice.record.deviceId]);
    expect(state.revoked.has(bob.record.deviceId)).toBe(true);
    expect(state.head.seq).toBe(4);
  });

  it("accepts a device approved with the paper recovery key, signed by that key", async () => {
    const ws = await workspace();
    const carol = await makeDevice("carol-tablet-000001", "carol");
    const recoverySigning = await importRecoverySigningKey(ws.recovery.printable, ws.recovery.publicJwk);
    const w = await wrapAllEpochsForDevice(ws.getKeys(), carol.record);
    ws.log.push(await addEntry({ log: ws.log, signer: { id: RECOVERY_SIGNER, key: recoverySigning }, device: rosterDevice(carol.record), wraps: w }));
    expect((await verifyRoster(ws.log)).devices.has(carol.record.deviceId)).toBe(true);
  });

  it("gives a stable 20-digit workspace fingerprint that depends on the first entry", async () => {
    const a = await workspace();
    const b = await workspace();
    const fa = workspaceFingerprint((await verifyRoster(a.log)).genesisHash);
    expect(fa).toMatch(/^\d{5} \d{5} \d{5} \d{5}$/);
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await a.approve(bob);
    expect(workspaceFingerprint((await verifyRoster(a.log)).genesisHash)).toBe(fa);
    expect(workspaceFingerprint((await verifyRoster(b.log)).genesisHash)).not.toBe(fa);
  });
});

describe("roster: tampering with the log is caught", () => {
  it("rejects an entry whose contents were changed after signing", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    const mallory = await makeDevice("mallory-phone-00001", "bob");
    const forged = structuredClone(ws.log);
    (forged[1] as Extract<RosterEntry, { type: "add" }>).body.device = rosterDevice(mallory.record);
    await fails(forged, /signature is not valid/);
  });

  it("rejects a signature that isn't even well-formed", async () => {
    const ws = await workspace();
    await fails([{ ...ws.log[0], sig: "!!not base64!!" }], /signature is not valid/);
  });

  it("rejects entries signed by a device the log never trusted", async () => {
    const ws = await workspace();
    const mallory = await makeDevice("mallory-phone-00001", "mallory");
    const bob = await makeDevice("bob-phone-0000001", "bob");
    const w = await wrapAllEpochsForDevice(ws.getKeys(), bob.record);
    ws.log.push(await addEntry({ log: ws.log, signer: signer(mallory), device: rosterDevice(bob.record), wraps: w }));
    await fails(ws.log, /not trusted/);
  });

  it("rejects a genesis not signed by one of its own devices, and a log that doesn't start with one", async () => {
    const ws = await workspace();
    const mallory = await makeDevice("mallory-phone-00001", "mallory");
    const g = ws.log[0] as Extract<RosterEntry, { type: "genesis" }>;
    const { sig: _sig, ...unsigned } = g;
    void _sig;
    await fails([await signEntry({ ...unsigned, by: mallory.record.deviceId }, mallory.keys.ecdsa.privateKey)], /own devices/);
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await fails(ws.log.slice(1), /genesis|out of order/);
  });

  it("rejects a second genesis entry in the middle of a log", async () => {
    const ws = await workspace();
    const g = ws.log[0] as Extract<RosterEntry, { type: "genesis" }>;
    const { sig: _sig, ...unsigned } = g;
    void _sig;
    const second = await signEntry({ ...unsigned, seq: 2, prev: await entryHash(g) }, ws.alice.keys.ecdsa.privateKey);
    await fails([g, second], /Only the first entry/);
  });

  it("rejects the recovery key signing anything but a device approval", async () => {
    const ws = await workspace();
    const signing = await importRecoverySigningKey(ws.recovery.printable, ws.recovery.publicJwk);
    const next = await generateRecoveryKey();
    const entry = await recoveryEntry({ log: ws.log, signer: { id: RECOVERY_SIGNER, key: signing }, recovery: next.publicJwk, wraps: await wrapAllEpochsForRecovery(ws.getKeys(), next.publicJwk) });
    await fails([...ws.log, entry], /Only a recovery approval/);
  });

  it("rejects dropped, reordered or spliced entries", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    const carol = await makeDevice("carol-tablet-000001", "carol");
    await ws.approve(bob);
    await ws.approve(carol);
    await fails([ws.log[0], ws.log[2]], /out of order/);
    await fails([ws.log[0], ws.log[2], ws.log[1]], /out of order/);
    const other = await workspace();
    await fails([ws.log[0], other.log[0]], /out of order|follow/);
  });

  it("a rewritten or truncated history is caught by the pin, though the truncated log is itself valid", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await ws.rotate([bob.record.deviceId]);
    const pin = { seq: 3, hash: await entryHash(ws.log[2]) };
    await expect(checkPin(ws.log, pin)).resolves.toBeUndefined();
    await expect(checkPin(ws.log.slice(0, 2), pin)).rejects.toThrow(/shorter/);
    // A fork: a different workspace's history of the same length.
    const fork = await workspace();
    const bob2 = await makeDevice("bob-phone-0000001", "bob");
    await fork.approve(bob2);
    await fork.rotate([bob2.record.deviceId]);
    await expect(checkPin(fork.log, pin)).rejects.toThrow(/rewritten/);
    await expect(checkPin(ws.log, undefined)).resolves.toBeUndefined();
  });

  it("rejects approvals that violate the rules", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    // The same device id twice.
    const again = await addEntry({ log: ws.log, signer: signer(ws.alice), device: rosterDevice(bob.record), wraps: await wrapAllEpochsForDevice(ws.getKeys(), bob.record) });
    await fails([...ws.log, again], /already used/);
    // Missing key copy for the new device.
    const carol = await makeDevice("carol-tablet-000001", "carol");
    const short = await addEntry({ log: ws.log, signer: signer(ws.alice), device: rosterDevice(carol.record), wraps: [] });
    await fails([...ws.log, short], /key copies/);
  });

  it("rejects rotations that skip an epoch, leave someone out, let a stranger in, or revoke the signer", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    const mallory = await makeDevice("mallory-phone-00001", "mallory");
    const base = (await rotateEpoch({ keys: ws.getKeys(), createdByDevice: ws.alice.record.deviceId, activeDevices: [ws.alice.record, bob.record], recoveryPublic: ws.recovery.publicJwk }));
    const common = { log: ws.log, signer: signer(ws.alice), sealingPublic: base.epoch.sealingPublic };

    // Skipped epoch.
    await fails([...ws.log, await rotateEntry({ ...common, epoch: 3, revoked: [], remaining: [ws.alice.record.deviceId, bob.record.deviceId], wraps: base.wraps })], /next epoch/);
    // Bob is left out of the wraps.
    const noBob = base.wraps.filter(w => w.recipient !== bob.record.deviceId);
    await fails([...ws.log, await rotateEntry({ ...common, epoch: 2, revoked: [], remaining: [ws.alice.record.deviceId, bob.record.deviceId], wraps: noBob })], /key copies/);
    // A stranger is given a copy.
    const withMallory = [...base.wraps, ...(await wrapAllEpochsForDevice(new Map([[2, new Uint8Array(32)]]), mallory.record))];
    await fails([...ws.log, await rotateEntry({ ...common, epoch: 2, revoked: [], remaining: [ws.alice.record.deviceId, bob.record.deviceId], wraps: withMallory })], /key copies/);
    // The device list that keeps access doesn't match the revocations.
    await fails([...ws.log, await rotateEntry({ ...common, epoch: 2, revoked: [bob.record.deviceId], remaining: [ws.alice.record.deviceId, bob.record.deviceId], wraps: base.wraps })], /keep access/);
    // A device can't revoke itself.
    await fails([...ws.log, await rotateEntry({ ...common, epoch: 2, revoked: [ws.alice.record.deviceId], remaining: [bob.record.deviceId], wraps: base.wraps.filter(w => w.recipient !== ws.alice.record.deviceId) })], /revoke itself/);
  });

  it("a revoked device can no longer sign entries, and the old recovery key can't approve devices", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await ws.rotate([bob.record.deviceId]);
    const carol = await makeDevice("carol-tablet-000001", "carol");
    const w = await wrapAllEpochsForDevice(ws.getKeys(), carol.record);
    await fails([...ws.log, await addEntry({ log: ws.log, signer: signer(bob), device: rosterDevice(carol.record), wraps: w })], /not trusted/);

    const oldSigning = await importRecoverySigningKey(ws.recovery.printable, ws.recovery.publicJwk);
    const newRecovery = await generateRecoveryKey();
    ws.log.push(await recoveryEntry({ log: ws.log, signer: signer(ws.alice), recovery: newRecovery.publicJwk, wraps: await wrapAllEpochsForRecovery(ws.getKeys(), newRecovery.publicJwk) }));
    await fails([...ws.log, await addEntry({ log: ws.log, signer: { id: RECOVERY_SIGNER, key: oldSigning }, device: rosterDevice(carol.record), wraps: w })], /signature is not valid/);
  });
});

describe("roster: the server must match the signed log", () => {
  it("accepts an honest server", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await ws.rotate([]);
    checkServerAgainstRoster(await verifyRoster(ws.log), ws.server());
  });

  it("catches an injected device, swapped keys, hidden devices, a swapped recovery key and sealing key, and fake epochs", async () => {
    const ws = await workspace();
    const state = await verifyRoster(ws.log);
    const mallory = await makeDevice("mallory-phone-00001", "alice");
    const honest = ws.server();
    const attempt = (change: (s: ServerKeyring) => ServerKeyring) => () => checkServerAgainstRoster(state, change(structuredClone(honest)));

    expect(attempt(s => ({ ...s, devices: [...s.devices, { deviceId: mallory.record.deviceId, uid: "alice", status: "active", ecdhPublic: mallory.record.ecdhPublic, ecdsaPublic: mallory.record.ecdsaPublic }] }))).toThrow(/never approved/);
    expect(attempt(s => ({ ...s, devices: s.devices.map(d => ({ ...d, ecdhPublic: mallory.record.ecdhPublic })) }))).toThrow(/differ from the signed log/);
    expect(attempt(s => ({ ...s, devices: [] }))).toThrow(/hides or demotes/);
    expect(attempt(s => ({ ...s, devices: s.devices.map(d => ({ ...d, status: "revoked" })) }))).toThrow();
    expect(attempt(s => ({ ...s, recoveryPublic: mallory.record.ecdhPublic }))).toThrow(/recovery key/);
    expect(attempt(s => ({ ...s, epochs: s.epochs.map(e => ({ ...e, sealingPublic: mallory.record.ecdhPublic })) }))).toThrow(/signing key/);
    expect(attempt(s => ({ ...s, currentEpoch: 9, epochs: [...s.epochs, { epoch: 9, sealingPublic: mallory.record.ecdhPublic }] }))).toThrow(/epoch/);
    expect(attempt(s => ({ ...s, currentEpoch: 1, epochs: [] }))).toThrow(/epochs/);
    expect(attempt(s => s)).not.toThrow();
  });

  it("catches a revoked device presented as revoked when the log never revoked it", async () => {
    const ws = await workspace();
    const state = await verifyRoster(ws.log);
    const honest = ws.server();
    const fake = { ...honest, devices: [...honest.devices, { ...honest.devices[0], deviceId: "ghost-device-0000001", status: "revoked" }] };
    expect(() => checkServerAgainstRoster(state, fake)).toThrow(/revoked device/);
  });

  it("catches a changed, extra or withheld key copy", async () => {
    const ws = await workspace();
    const bob = await makeDevice("bob-phone-0000001", "bob");
    await ws.approve(bob);
    await ws.rotate([]);
    const state = await verifyRoster(ws.log);
    const mine = ws.wraps.filter(w => w.recipient === bob.record.deviceId);
    expect(mine).toHaveLength(2);
    await expect(checkWrapsAgainstRoster(state, bob.record.deviceId, mine)).resolves.toBeUndefined();

    const swapped = mine.map(w => (w.epoch === 2 ? { ...w, wrap: { ...w.wrap, ct: w.wrap.ct.slice(0, -2) + "AA" } } : w));
    await expect(checkWrapsAgainstRoster(state, bob.record.deviceId, swapped)).rejects.toThrow(/changed on the server/);
    await expect(checkWrapsAgainstRoster(state, bob.record.deviceId, mine.slice(0, 1))).rejects.toThrow(/withheld/);
    // A copy for an epoch the log never created.
    await expect(checkWrapsAgainstRoster(state, bob.record.deviceId, [...mine, { ...mine[0], epoch: 3 }], 3)).rejects.toThrow(/no key copy/);
    // Anything above the current epoch is ignored by callers that pass the current epoch.
    await expect(checkWrapsAgainstRoster(state, bob.record.deviceId, [...mine, { ...mine[0], epoch: 3 }])).resolves.toBeUndefined();
    expect(RECOVERY_RECIPIENT).toBe(RECOVERY_SIGNER);
  });
});

describe("roster: overview adapter", () => {
  it("reshapes an API overview into a server keyring", () => {
    const keyring = keyringFromOverview({ state: { recoveryPublic: null, currentEpoch: 4 }, devices: [], epochs: [] });
    expect(keyring).toEqual({ devices: [], recoveryPublic: null, currentEpoch: 4, epochs: [] });
  });
});
