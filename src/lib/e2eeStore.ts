import "server-only";
import crypto from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import type { z } from "zod";
import {
  RosterError,
  canonicalJson,
  type GenesisBody,
  rosterDevice,
  rosterKey,
  verifyRoster,
  wrapDigests,
  type RosterEntry,
  type RosterState
} from "./e2ee/roster";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgDocPath } from "./firestorePaths";
import type {
  epochRecordSchema,
  keyWrapSchema,
  publicJwkSchema,
  recoveryCheckSchema,
  wrapRecordSchema
} from "./e2ee/schemas";

/**
 * Server-side keyring storage (plan §4.3). The server stores ONLY public keys and
 * wrapped (encrypted) workspace keys; it can never decrypt anything. It enforces
 * who may change the keyring, and that every rotation covers every active device.
 *
 * organizations/ghmo/e2ee/state                     enabled, currentEpoch, recovery public key, trustees
 * organizations/ghmo/e2ee/state/devices/{deviceId}  device public keys and status
 * organizations/ghmo/e2ee/state/epochs/{epoch}      sealing key pair (private half encrypted)
 * organizations/ghmo/e2ee/state/wraps/{epoch_recipient}  workspace key wrapped for a device or "recovery"
 */

type PublicJwk = z.infer<typeof publicJwkSchema>;
export type WrapRecordInput = z.infer<typeof wrapRecordSchema>;
export type EpochRecordInput = z.infer<typeof epochRecordSchema>;
type RecoveryCheck = z.infer<typeof recoveryCheckSchema>;
type KeyWrap = z.infer<typeof keyWrapSchema>;

export const MAX_DEVICES_PER_ADMIN = 10;

export type E2eeState = {
  enabled: boolean;
  currentEpoch: number;
  recoveryPublic: PublicJwk | null;
  recoveryCheck: { wrap: KeyWrap; tokenHash: string } | null;
  trustees: { name: string; confirmedAt: string }[];
  enabledAt: string | null;
  recoveryRotatedAt: string | null;
};

export type StoredDevice = {
  deviceId: string;
  uid: string;
  name: string;
  ecdhPublic: PublicJwk;
  ecdsaPublic: PublicJwk;
  unlock: "prf" | "passphrase";
  status: "pending" | "active" | "revoked";
  createdAt: string;
  approvedBy: string | null;
  approvedVia: "bootstrap" | "device" | "recovery" | null;
  revokedAt: string | null;
};

const base = () => `${orgDocPath(COMMUNITY_SLUG)}/e2ee/state`;
const stateRef = () => getAdminDb().doc(base());
const devicesCol = () => getAdminDb().collection(`${base()}/devices`);
const epochsCol = () => getAdminDb().collection(`${base()}/epochs`);
const wrapsCol = () => getAdminDb().collection(`${base()}/wraps`);
const rosterCol = () => getAdminDb().collection(`${base()}/roster`);
const rosterId = (seq: number) => String(seq).padStart(6, "0");
const wrapId = (epoch: number, recipient: string) => `${epoch}_${recipient}`;

export class KeyringError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "KeyringError";
  }
}

const EMPTY_STATE: E2eeState = {
  enabled: false,
  currentEpoch: 0,
  recoveryPublic: null,
  recoveryCheck: null,
  trustees: [],
  enabledAt: null,
  recoveryRotatedAt: null
};

export async function getState(tx?: Transaction): Promise<E2eeState> {
  const snap = tx ? await tx.get(stateRef()) : await stateRef().get();
  return snap.exists ? { ...EMPTY_STATE, ...(snap.data() as Partial<E2eeState>) } : EMPTY_STATE;
}

export async function listDevices(): Promise<StoredDevice[]> {
  const snap = await devicesCol().get();
  return snap.docs.map(d => d.data() as StoredDevice);
}

export async function listEpochs(): Promise<EpochRecordInput[]> {
  const snap = await epochsCol().orderBy("epoch").get();
  return snap.docs.map(d => d.data() as EpochRecordInput);
}

export async function listWraps(recipient: string): Promise<WrapRecordInput[]> {
  const snap = await wrapsCol().where("recipient", "==", recipient).get();
  return snap.docs.map(d => d.data() as WrapRecordInput).sort((a, b) => a.epoch - b.epoch);
}

export async function registerDevice(device: Omit<StoredDevice, "status" | "createdAt" | "approvedBy" | "approvedVia" | "revokedAt">) {
  const ref = devicesCol().doc(device.deviceId);
  await getAdminDb().runTransaction(async tx => {
    // Single-field query (no composite index needed); status filtered in memory.
    const [existing, mine] = await Promise.all([tx.get(ref), tx.get(devicesCol().where("uid", "==", device.uid))]);
    if (existing.exists) throw new KeyringError(409, "This device is already registered");
    const live = mine.docs.filter(d => (d.data() as StoredDevice).status !== "revoked");
    if (live.length >= MAX_DEVICES_PER_ADMIN) throw new KeyringError(409, "Too many devices. Remove an old one first.");
    tx.set(ref, {
      ...device,
      status: "pending",
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedVia: null,
      revokedAt: null
    } satisfies StoredDevice);
  });
}

export async function readRoster(tx?: Transaction): Promise<RosterEntry[]> {
  const query = rosterCol().orderBy("seq");
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs.map(d => d.data() as RosterEntry);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** The digests in a signed entry must be exactly those of the key copies being stored. */
async function digestsMatch(entryWraps: { epoch: number; recipient: string; h: string }[], wraps: WrapRecordInput[]) {
  const key = (d: { epoch: number; recipient: string; h: string }) => `${d.epoch}|${d.recipient}|${d.h}`;
  return sameSet(entryWraps.map(key), (await wrapDigests(wraps)).map(key));
}

/**
 * Checks the signed device-log entry that must accompany a change to who holds keys. Returns it (to be
 * stored in the same transaction) or null for a workspace whose log hasn't been started yet.
 * The browsers re-verify everything; this stops a stolen session or a buggy client from adding to the log.
 */
async function acceptEntry<T extends RosterEntry["type"]>(
  roster: RosterEntry[],
  entry: RosterEntry | undefined,
  type: T,
  matches: (entry: Extract<RosterEntry, { type: T }>) => boolean | Promise<boolean>
): Promise<RosterEntry | null> {
  if (roster.length === 0 && type !== "genesis") {
    if (entry) throw new KeyringError(409, "Seal the device list before making signed changes");
    return null;
  }
  if (!entry) throw new KeyringError(409, "This change needs a signed device-list entry");
  if (entry.type !== type || !(await matches(entry as Extract<RosterEntry, { type: T }>))) {
    throw new KeyringError(400, "The signed device-list entry doesn't match this change");
  }
  try {
    await verifyRoster([...roster, entry]);
  } catch (error) {
    if (error instanceof RosterError) throw new KeyringError(400, `Signed entry refused: ${error.message}`);
    throw error;
  }
  return entry;
}

function storeEntry(tx: Transaction, entry: RosterEntry | null) {
  if (entry) tx.create(rosterCol().doc(rosterId(entry.seq)), entry);
}

export type { RosterState };

export function hashRecoveryToken(tokenB64Url: string): string {
  return crypto.createHash("sha256").update(Buffer.from(tokenB64Url, "base64url")).digest("hex");
}

function checkWrapsCover(wraps: WrapRecordInput[], expected: { epoch: number; recipient: string }[]) {
  const got = new Set(wraps.map(w => wrapId(w.epoch, w.recipient)));
  const want = new Set(expected.map(e => wrapId(e.epoch, e.recipient)));
  if (got.size !== wraps.length) throw new KeyringError(400, "Duplicate key wraps");
  for (const id of want) if (!got.has(id)) throw new KeyringError(400, `Missing key wrap ${id}`);
  for (const id of got) if (!want.has(id)) throw new KeyringError(400, `Unexpected key wrap ${id}`);
}

/** One-time setup by a super admin: epoch 1, the first device, the recovery key and its two trustees. */
export async function bootstrap(params: {
  uid: string;
  deviceId: string;
  epoch: EpochRecordInput;
  wraps: WrapRecordInput[];
  recoveryPublic: PublicJwk;
  recoveryCheck: RecoveryCheck;
  trustees: { name: string }[];
  entry?: RosterEntry;
}) {
  if (params.epoch.epoch !== 1) throw new KeyringError(400, "Setup starts at epoch 1");
  if (params.epoch.createdByDevice !== params.deviceId) throw new KeyringError(400, "Epoch must be created by your device");
  const names = params.trustees.map(t => t.name.trim().toLowerCase());
  if (names.length !== 2 || names[0] === names[1]) throw new KeyringError(400, "Two different trustees are required");
  checkWrapsCover(params.wraps, [
    { epoch: 1, recipient: params.deviceId },
    { epoch: 1, recipient: "recovery" }
  ]);

  await getAdminDb().runTransaction(async tx => {
    const state = await getState(tx);
    if (state.enabled) throw new KeyringError(409, "End-to-end encryption is already set up");
    const deviceRef = devicesCol().doc(params.deviceId);
    const device = await tx.get(deviceRef);
    if (!device.exists || (device.data() as StoredDevice).uid !== params.uid) {
      throw new KeyringError(400, "Register this device first");
    }
    const roster = await readRoster(tx);
    const stored = device.data() as StoredDevice;
    const entry = await acceptEntry(roster, params.entry, "genesis", async e => {
      const b = e.body;
      return (
        e.by === params.deviceId &&
        b.devices.length === 1 &&
        canonicalJson(b.devices[0]) === canonicalJson(rosterDevice(stored)) &&
        canonicalJson(b.recovery) === canonicalJson(rosterKey(params.recoveryPublic)) &&
        b.epochs.length === 1 &&
        b.epochs[0].epoch === 1 &&
        canonicalJson(b.epochs[0].sealing) === canonicalJson(rosterKey(params.epoch.sealingPublic)) &&
        (await digestsMatch(b.wraps, params.wraps))
      );
    });
    if (!entry) throw new KeyringError(400, "Setup needs the signed first entry of the device list");
    storeEntry(tx, entry);
    const now = new Date().toISOString();
    tx.update(deviceRef, { status: "active", approvedBy: params.uid, approvedVia: "bootstrap" });
    tx.set(epochsCol().doc("1"), params.epoch);
    for (const w of params.wraps) tx.set(wrapsCol().doc(wrapId(w.epoch, w.recipient)), w);
    tx.set(stateRef(), {
      enabled: true,
      currentEpoch: 1,
      recoveryPublic: params.recoveryPublic,
      recoveryCheck: params.recoveryCheck,
      trustees: params.trustees.map(t => ({ name: t.name.trim(), confirmedAt: now })),
      enabledAt: now,
      recoveryRotatedAt: now
    } satisfies E2eeState);
  });
}

/**
 * Activates a pending device with wraps of every epoch. Allowed when the caller
 * approves from one of their own active devices or another admin's (via "device"),
 * or proves possession of the paper recovery key (via "recovery").
 */
export async function approveDevice(params: {
  approverUid: string;
  deviceId: string;
  wraps: WrapRecordInput[];
  via: { kind: "device"; approverDeviceId: string } | { kind: "recovery"; recoveryToken: string };
  entry?: RosterEntry;
}) {
  await getAdminDb().runTransaction(async tx => {
    const state = await getState(tx);
    if (!state.enabled) throw new KeyringError(409, "End-to-end encryption is not set up yet");
    const targetRef = devicesCol().doc(params.deviceId);
    const target = await tx.get(targetRef);
    const roster = await readRoster(tx);
    if (!target.exists) throw new KeyringError(404, "Device not found");
    const device = target.data() as StoredDevice;
    if (device.status !== "pending") throw new KeyringError(409, "Device is not waiting for approval");

    if (params.via.kind === "device") {
      if (params.via.approverDeviceId === params.deviceId) throw new KeyringError(403, "A device cannot approve itself");
      const approver = await tx.get(devicesCol().doc(params.via.approverDeviceId));
      const approverData = approver.data() as StoredDevice | undefined;
      if (!approverData || approverData.uid !== params.approverUid || approverData.status !== "active") {
        throw new KeyringError(403, "Approve from one of your active devices");
      }
    } else {
      // Recovery: only the paper key can decrypt the token, and only its owner may use it on their own device.
      if (device.uid !== params.approverUid) throw new KeyringError(403, "Use the recovery key on your own device");
      if (!state.recoveryCheck || hashRecoveryToken(params.via.recoveryToken) !== state.recoveryCheck.tokenHash) {
        throw new KeyringError(403, "Recovery key check failed");
      }
    }

    const expected = Array.from({ length: state.currentEpoch }, (_, i) => ({ epoch: i + 1, recipient: params.deviceId }));
    checkWrapsCover(params.wraps, expected);
    const entry = await acceptEntry(roster, params.entry, "add", async e =>
      e.by === (params.via.kind === "device" ? params.via.approverDeviceId : "recovery") &&
      e.body.via === params.via.kind &&
      canonicalJson(e.body.device) === canonicalJson(rosterDevice(device)) &&
      (await digestsMatch(e.body.wraps, params.wraps))
    );
    storeEntry(tx, entry);
    for (const w of params.wraps) tx.set(wrapsCol().doc(wrapId(w.epoch, w.recipient)), w);
    tx.update(targetRef, { status: "active", approvedBy: params.approverUid, approvedVia: params.via.kind });
  });
}

/**
 * New epoch, optionally revoking devices. The new epoch must be wrapped for exactly
 * every remaining active device plus the recovery key, so nobody is left out and no
 * revoked or pending device is let in. Revoked devices' wraps are deleted.
 */
export async function rotate(params: {
  uid: string;
  byDeviceId: string;
  revokeDeviceIds: string[];
  epoch: EpochRecordInput;
  wraps: WrapRecordInput[];
  canRevokeOthers: boolean;
  entry?: RosterEntry;
}) {
  const revokedWrapDocs = await Promise.all(
    params.revokeDeviceIds.map(id => wrapsCol().where("recipient", "==", id).get())
  );
  await getAdminDb().runTransaction(async tx => {
    const state = await getState(tx);
    if (!state.enabled) throw new KeyringError(409, "End-to-end encryption is not set up yet");
    if (params.epoch.epoch !== state.currentEpoch + 1) throw new KeyringError(409, "Someone else rotated first. Reload and try again.");
    if (params.epoch.createdByDevice !== params.byDeviceId) throw new KeyringError(400, "Epoch must be created by your device");

    const devices = (await tx.get(devicesCol())).docs.map(d => d.data() as StoredDevice);
    const roster = await readRoster(tx);
    const byDevice = devices.find(d => d.deviceId === params.byDeviceId);
    if (!byDevice || byDevice.uid !== params.uid || byDevice.status !== "active") {
      throw new KeyringError(403, "Rotate from one of your active devices");
    }
    if (params.revokeDeviceIds.includes(params.byDeviceId)) throw new KeyringError(400, "You cannot revoke the device you are using");
    for (const id of params.revokeDeviceIds) {
      const d = devices.find(x => x.deviceId === id);
      if (!d) throw new KeyringError(404, `Device ${id} not found`);
      if (d.uid !== params.uid && !params.canRevokeOthers) throw new KeyringError(403, "Only a super admin can revoke another admin's device");
    }

    const remaining = devices.filter(d => d.status === "active" && !params.revokeDeviceIds.includes(d.deviceId));
    checkWrapsCover(params.wraps, [
      ...remaining.map(d => ({ epoch: params.epoch.epoch, recipient: d.deviceId })),
      { epoch: params.epoch.epoch, recipient: "recovery" }
    ]);

    const entry = await acceptEntry(roster, params.entry, "rotate", async e =>
      e.by === params.byDeviceId &&
      e.body.epoch === params.epoch.epoch &&
      canonicalJson(e.body.sealing) === canonicalJson(rosterKey(params.epoch.sealingPublic)) &&
      sameSet(e.body.revoked, params.revokeDeviceIds) &&
      sameSet(e.body.devices, remaining.map(d => d.deviceId)) &&
      (await digestsMatch(e.body.wraps, params.wraps))
    );
    storeEntry(tx, entry);
    const now = new Date().toISOString();
    for (const id of params.revokeDeviceIds) {
      tx.update(devicesCol().doc(id), { status: "revoked", revokedAt: now });
    }
    for (const snap of revokedWrapDocs) for (const doc of snap.docs) tx.delete(doc.ref);
    tx.set(epochsCol().doc(String(params.epoch.epoch)), params.epoch);
    for (const w of params.wraps) tx.set(wrapsCol().doc(wrapId(w.epoch, w.recipient)), w);
    tx.update(stateRef(), { currentEpoch: params.epoch.epoch });
  });
}

/** Replaces the recovery key (after a recovery, or a lost paper copy): every epoch rewrapped to the new key. */
export async function replaceRecoveryKey(params: {
  recoveryPublic: PublicJwk;
  recoveryCheck: RecoveryCheck;
  wraps: WrapRecordInput[];
  trustees: { name: string }[];
  byDeviceId?: string;
  entry?: RosterEntry;
}) {
  const names = params.trustees.map(t => t.name.trim().toLowerCase());
  if (names.length !== 2 || names[0] === names[1]) throw new KeyringError(400, "Two different trustees are required");
  await getAdminDb().runTransaction(async tx => {
    const state = await getState(tx);
    const roster = await readRoster(tx);
    if (!state.enabled) throw new KeyringError(409, "End-to-end encryption is not set up yet");
    checkWrapsCover(
      params.wraps,
      Array.from({ length: state.currentEpoch }, (_, i) => ({ epoch: i + 1, recipient: "recovery" }))
    );
    const entry = await acceptEntry(roster, params.entry, "recovery", async e =>
      e.by === params.byDeviceId &&
      canonicalJson(e.body.recovery) === canonicalJson(rosterKey(params.recoveryPublic)) &&
      (await digestsMatch(e.body.wraps, params.wraps))
    );
    storeEntry(tx, entry);
    const now = new Date().toISOString();
    for (const w of params.wraps) tx.set(wrapsCol().doc(wrapId(w.epoch, w.recipient)), w);
    tx.update(stateRef(), {
      recoveryPublic: params.recoveryPublic,
      recoveryCheck: params.recoveryCheck,
      trustees: params.trustees.map(t => ({ name: t.name.trim(), confirmedAt: now })),
      recoveryRotatedAt: now
    });
  });
}

export async function withdrawPendingDevice(uid: string, deviceId: string) {
  const ref = devicesCol().doc(deviceId);
  await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const device = snap.data() as StoredDevice | undefined;
    if (!device || device.uid !== uid) throw new KeyringError(404, "Device not found");
    if (device.status !== "pending") throw new KeyringError(409, "Only pending devices can be withdrawn; revoke active ones");
    tx.delete(ref);
  });
}


/**
 * What the device log would say if it were started now from the server's own records. Used once, to give
 * a workspace that was set up before the log existed a signed starting point: a super admin checks the
 * device list (safety codes) and signs this.
 */
export async function snapshotCandidate(tx?: Transaction): Promise<GenesisBody> {
  const state = await getState(tx);
  if (!state.enabled || !state.recoveryPublic) throw new KeyringError(409, "End-to-end encryption is not set up yet");
  const [devicesSnap, epochsSnap, wrapsSnap] = tx
    ? await Promise.all([tx.get(devicesCol()), tx.get(epochsCol().orderBy("epoch")), tx.get(wrapsCol())])
    : await Promise.all([devicesCol().get(), epochsCol().orderBy("epoch").get(), wrapsCol().get()]);
  const devices = devicesSnap.docs.map(d => d.data() as StoredDevice).filter(d => d.status === "active");
  return {
    devices: devices.map(rosterDevice).sort((a, b) => (a.id < b.id ? -1 : 1)),
    recovery: rosterKey(state.recoveryPublic),
    epochs: epochsSnap.docs.map(d => d.data() as EpochRecordInput).map(e => ({ epoch: e.epoch, sealing: rosterKey(e.sealingPublic) })),
    wraps: await wrapDigests(wrapsSnap.docs.map(d => d.data() as WrapRecordInput))
  };
}

/** Starts the device log for a workspace that has none (see snapshotCandidate). */
export async function sealRoster(params: { uid: string; deviceId: string; entry: RosterEntry }) {
  await getAdminDb().runTransaction(async tx => {
    const roster = await readRoster(tx);
    if (roster.length > 0) throw new KeyringError(409, "The device list is already sealed");
    const device = (await tx.get(devicesCol().doc(params.deviceId))).data() as StoredDevice | undefined;
    if (!device || device.uid !== params.uid || device.status !== "active") throw new KeyringError(403, "Seal from one of your active devices");
    const candidate = await snapshotCandidate(tx);
    const entry = await acceptEntry([], params.entry, "genesis", e => e.by === params.deviceId && canonicalJson(e.body) === canonicalJson(candidate));
    storeEntry(tx, entry);
  });
}
