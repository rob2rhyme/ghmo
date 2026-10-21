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
};

const DB_NAME = "ghmo-e2ee";
const STORE = "devices";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "uid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
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
