/**
 * Keyring operations (plan §4.3). Pure functions over keys and records; storage
 * lives elsewhere (server APIs + Firestore). All secrets stay on admin devices:
 * the server only ever stores public keys and wrapped (encrypted) keys.
 */
import {
  aesKeyFromRaw,
  epochWrapContext,
  generateSealingKeys,
  generateWorkspaceKey,
  unwrapWithPrivateKey,
  wrapToPublicKey,
  type KeyWrap,
  type PublicJwk,
  type SealedBytes
} from "./keys";

export const RECOVERY_RECIPIENT = "recovery";

export type DeviceStatus = "pending" | "active" | "revoked";

export type DevicePublicRecord = {
  deviceId: string;
  uid: string;
  name: string;
  ecdhPublic: PublicJwk;
  ecdsaPublic: PublicJwk;
  status: DeviceStatus;
  unlock: "prf" | "passphrase";
};

export type EpochRecord = {
  epoch: number;
  sealingPublic: PublicJwk;
  sealingPrivate: SealedBytes;
  createdByDevice: string;
};

export type WrapRecord = { epoch: number; recipient: string; wrap: KeyWrap };

/** Workspace keys this device holds, by epoch (raw 32-byte keys, kept in memory only). */
export type EpochKeys = Map<number, Uint8Array<ArrayBuffer>>;

export function isValidDeviceId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) && id !== RECOVERY_RECIPIENT;
}

async function wrapEpoch(epoch: number, wdk: Uint8Array<ArrayBuffer>, recipient: string, publicKey: PublicJwk): Promise<WrapRecord> {
  return { epoch, recipient, wrap: await wrapToPublicKey(wdk, publicKey, epochWrapContext(epoch, recipient)) };
}

async function newEpoch(epoch: number, createdByDevice: string) {
  const raw = generateWorkspaceKey();
  const { publicJwk, sealedPrivate } = await generateSealingKeys(await aesKeyFromRaw(raw), epoch);
  const record: EpochRecord = { epoch, sealingPublic: publicJwk, sealingPrivate: sealedPrivate, createdByDevice };
  return { raw, record };
}

/** First epoch: wrapped for the bootstrapping device and the recovery key. */
export async function createInitialEpoch(params: { device: DevicePublicRecord; recoveryPublic: PublicJwk }) {
  const { raw, record } = await newEpoch(1, params.device.deviceId);
  const wraps = await Promise.all([
    wrapEpoch(1, raw, params.device.deviceId, params.device.ecdhPublic),
    wrapEpoch(1, raw, RECOVERY_RECIPIENT, params.recoveryPublic)
  ]);
  return { epoch: record, wraps, keys: new Map([[1, raw]]) as EpochKeys };
}

/** Approving a device: wrap every epoch's key for it, so it can read old and new data. */
export async function wrapAllEpochsForDevice(keys: EpochKeys, device: DevicePublicRecord): Promise<WrapRecord[]> {
  return Promise.all([...keys].map(([epoch, raw]) => wrapEpoch(epoch, raw, device.deviceId, device.ecdhPublic)));
}

/**
 * Rotation after revoking a device (or on schedule): a new epoch whose key is wrapped
 * only for the remaining active devices and the recovery key. Data written from now
 * on is unreadable to revoked devices.
 */
export async function rotateEpoch(params: {
  keys: EpochKeys;
  createdByDevice: string;
  activeDevices: DevicePublicRecord[];
  recoveryPublic: PublicJwk;
}) {
  const current = Math.max(0, ...params.keys.keys());
  const epochNumber = current + 1;
  const { raw, record } = await newEpoch(epochNumber, params.createdByDevice);
  const recipients = params.activeDevices.filter(d => d.status === "active");
  const wraps = await Promise.all([
    ...recipients.map(d => wrapEpoch(epochNumber, raw, d.deviceId, d.ecdhPublic)),
    wrapEpoch(epochNumber, raw, RECOVERY_RECIPIENT, params.recoveryPublic)
  ]);
  const keys: EpochKeys = new Map(params.keys);
  keys.set(epochNumber, raw);
  return { epoch: record, wraps, keys };
}

/** A new recovery key (after a recovery, or if a paper copy is lost): rewrap every epoch to it. */
export async function wrapAllEpochsForRecovery(keys: EpochKeys, recoveryPublic: PublicJwk): Promise<WrapRecord[]> {
  return Promise.all([...keys].map(([epoch, raw]) => wrapEpoch(epoch, raw, RECOVERY_RECIPIENT, recoveryPublic)));
}

/**
 * Opens the wraps addressed to `recipient` with its private key.
 *
 * - Wraps for an epoch above `maxEpoch` (the workspace's current epoch) are ignored, so a server can't make
 *   devices start encrypting under an epoch it invented.
 * - A wrap for an older epoch that fails to open is skipped (that history just stays unreadable), but
 *   the newest wrap must open, otherwise this throws: a wrong key must never look like success.
 */
export async function unwrapEpochKeys(
  wraps: WrapRecord[],
  recipient: string,
  privateKey: CryptoKey,
  options: { maxEpoch?: number } = {}
): Promise<EpochKeys> {
  const mine = wraps.filter(w => w.recipient === recipient && (options.maxEpoch === undefined || w.epoch <= options.maxEpoch));
  const keys: EpochKeys = new Map();
  const newest = Math.max(0, ...mine.map(w => w.epoch));
  for (const w of mine) {
    try {
      keys.set(w.epoch, await unwrapWithPrivateKey(w.wrap, privateKey, epochWrapContext(w.epoch, recipient)));
    } catch (error) {
      if (w.epoch === newest) throw error;
    }
  }
  return keys;
}

export function currentEpoch(keys: EpochKeys): number {
  return Math.max(0, ...keys.keys());
}
