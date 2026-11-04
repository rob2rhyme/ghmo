/**
 * Browser storage for this device's E2EE identity (IndexedDB). Only sealed
 * (encrypted) private keys are stored; they open with the passkey's PRF output or
 * the passphrase. Nothing here is ever sent to the server except public keys.
 */
import type { PublicJwk, SealedBytes } from "../keys";

export type StoredDeviceIdentity = {
  /** One identity per admin per browser. */
  uid: string;
  deviceId: string;
  name: string;
  ecdhPublic: PublicJwk;
  ecdsaPublic: PublicJwk;
  sealed: SealedBytes & { v: 1 };
  unlock:
    | { method: "prf"; credentialId: string; salt: string }
    | { method: "passphrase"; salt: string; iterations: number };
  createdAt: string;
  /** The newest device-log entry this device has verified; the log must never shrink or change behind it. */
  rosterPin?: { seq: number; hash: string };
  /** This browser has seen encryption on (it can't be switched off), even before the device list was sealed. */
  seenEnabled?: boolean;
};

const DB_NAME = "ghmo-e2ee";
const STORE = "devices";
/** What this browser has verified, kept when a device is forgotten so a new one starts from it (see rollback.ts). */
const PINS = "pins";

export type StoredPins = { uid: string; rosterPin?: { seq: number; hash: string }; seenEnabled?: boolean };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "uid" });
      if (!db.objectStoreNames.contains(PINS)) db.createObjectStore(PINS, { keyPath: "uid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, name: string = STORE): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = fn(tx.objectStore(name));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function loadIdentity(uid: string): Promise<StoredDeviceIdentity | undefined> {
  return withStore("readonly", store => store.get(uid) as IDBRequest<StoredDeviceIdentity | undefined>);
}

export async function saveIdentity(identity: StoredDeviceIdentity): Promise<void> {
  await withStore("readwrite", store => store.put(identity));
}

export async function deleteIdentity(uid: string): Promise<void> {
  await withStore("readwrite", store => store.delete(uid));
}

export function loadPins(uid: string): Promise<StoredPins | undefined> {
  return withStore("readonly", store => store.get(uid) as IDBRequest<StoredPins | undefined>, PINS);
}

export async function savePins(pins: StoredPins): Promise<void> {
  await withStore("readwrite", store => store.put(pins), PINS);
}
