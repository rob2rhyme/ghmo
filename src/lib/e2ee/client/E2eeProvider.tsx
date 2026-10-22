"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fromBase64Url, randomBytes, toBase64Url } from "../encoding";
import { decryptRecord, encryptRecord, type Envelope, type RecordLocation } from "../envelope";
import {
  aesKeyFromRaw,
  deviceSafetyCode,
  exportPublicJwk,
  generateDeviceKeys,
  kekFromPassphrase,
  kekFromPrf,
  openDeviceKeys,
  openSealingPrivateKey,
  openSignature,
  PBKDF2_ITERATIONS,
  sealDeviceKeys,
  type KeyWrap,
  type OpenedDeviceKeys,
  type PublicJwk,
  type SealedSignature
} from "../keys";
import {
  createInitialEpoch,
  currentEpoch,
  rotateEpoch,
  unwrapEpochKeys,
  wrapAllEpochsForDevice,
  wrapAllEpochsForRecovery,
  type DevicePublicRecord,
  type EpochKeys,
  type EpochRecord,
  type WrapRecord
} from "../keyring";
import { answerRecoveryCheck, createRecoveryCheck, generateRecoveryKey, importRecoveryPrivateKey } from "../recovery";
import { clearLocalDrafts } from "@/src/lib/localDrafts";
import { deleteIdentity, loadIdentity, saveIdentity, type StoredDeviceIdentity } from "./deviceStore";
import { evaluatePrf } from "./prf";

export type DeviceView = DevicePublicRecord & {
  createdAt: string;
  approvedVia: string | null;
  revokedAt: string | null;
  ownerName: string;
  ownerActive: boolean;
  safetyCode: string;
};

export type Overview = {
  me: { uid: string; superAdmin: boolean };
  state: {
    enabled: boolean;
    currentEpoch: number;
    recoveryPublic: PublicJwk | null;
    recoveryCheckWrap: KeyWrap | null;
    trustees: { name: string; confirmedAt: string }[];
    enabledAt: string | null;
    recoveryRotatedAt: string | null;
  };
  epochs: EpochRecord[];
  devices: DeviceView[];
};

export type E2eeStatus = "loading" | "error" | "not-setup" | "no-device" | "pending" | "locked" | "unlocked" | "revoked";

type Unlocked = { identity: StoredDeviceIdentity; keys: OpenedDeviceKeys; epochKeys: EpochKeys };

export type PreparedRecovery = {
  printable: string;
  recoveryPublic: PublicJwk;
  recoveryCheck: Awaited<ReturnType<typeof createRecoveryCheck>>;
};

/** How a stored record was read: decrypted, plaintext from before encryption, or unreadable. */
export type RecordState = "encrypted" | "legacy" | "failed";
export type Unpacked<T> = T & { _e2ee: RecordState; _e2eeError?: string };

type E2eeContextValue = {
  status: E2eeStatus;
  /** Encryption is on for the workspace: new private data must be stored as envelopes. */
  enabled: boolean;
  /** This device's own keys are open in memory (also true for a pending device). */
  keysOpen: boolean;
  error: string | null;
  overview: Overview | null;
  identity: StoredDeviceIdentity | null;
  thisDevice: DeviceView | null;
  refresh: () => Promise<void>;
  createDevice: (params: { name: string; method: "prf" | "passphrase"; passphrase?: string }) => Promise<void>;
  forgetThisDevice: () => Promise<void>;
  unlock: (passphrase?: string) => Promise<void>;
  lock: () => void;
  prepareRecoveryKey: () => Promise<PreparedRecovery>;
  finishBootstrap: (prepared: PreparedRecovery, trustees: string[]) => Promise<void>;
  approveDevice: (deviceId: string) => Promise<void>;
  rotate: (revokeDeviceIds: string[]) => Promise<void>;
  recoverThisDevice: (printable: string) => Promise<void>;
  checkRecoveryKey: (printable: string) => Promise<number>;
  finishRecoveryReplacement: (prepared: PreparedRecovery, trustees: string[]) => Promise<void>;
  encrypt: (location: RecordLocation, data: unknown) => Promise<Envelope>;
  decrypt: <T>(envelope: unknown, location: RecordLocation) => Promise<T>;
  /**
   * Prepares the private part of a record for storage: `{ enc }` when encryption is on,
   * the fields themselves (plaintext) otherwise. Spread the result into the document.
   */
  /** Opens a signature that a signer sealed to the workspace key. */
  openSealedSignature: (sealed: SealedSignature, sessionId: string) => Promise<Uint8Array<ArrayBuffer>>;
  packPrivate: (location: RecordLocation, privateFields: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Reads a stored record: decrypts its `enc` envelope and merges the private fields in.
   * Records stored before encryption was turned on are returned as they are (`_e2ee: "legacy"`).
   */
  unpackPrivate: <T extends Record<string, unknown>>(raw: Record<string, unknown>, location: RecordLocation) => Promise<Unpacked<T>>;
};

const E2eeContext = createContext<E2eeContextValue | null>(null);

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function newDeviceId() {
  return toBase64Url(randomBytes(18));
}

/**
 * Holds this browser's E2EE state for the admin area. Decrypted keys live only in
 * memory and are dropped on lock, sign-out or page close.
 */
export function E2eeProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [identity, setIdentity] = useState<StoredDeviceIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // State drives rendering; the ref gives callbacks the latest keys without re-creating them.
  const [isUnlocked, setIsUnlocked] = useState(false);
  const unlockedRef = useRef<Unlocked | null>(null);
  // Decrypted records by envelope signature (snapshots re-deliver unchanged documents often).
  // Holds plaintext, so it is emptied whenever the keys are dropped.
  const decryptCache = useRef(new Map<string, Record<string, unknown>>());
  // Latest overview for the stable encrypt/decrypt callbacks below (components subscribe to
  // Firestore with these, so their identity must not change on every status refresh).
  const overviewRef = useRef<Overview | null>(null);
  useEffect(() => {
    overviewRef.current = overview;
  }, [overview]);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Omit<Overview, "devices"> & { devices: Omit<DeviceView, "safetyCode">[] }>("/api/admin/e2ee");
      const devices = await Promise.all(
        data.devices.map(async d => ({ ...d, safetyCode: await deviceSafetyCode(d.ecdhPublic, d.ecdsaPublic) }))
      );
      setOverview({ ...data, devices });
      const stored = (await loadIdentity(data.me.uid)) ?? null;
      setIdentity(stored);
      // A device whose own keys are open (e.g. just set up) that has since been approved:
      // fetch its copies of the workspace keys now, instead of looking unlocked while empty.
      const session = unlockedRef.current;
      const self = stored ? devices.find(d => d.deviceId === stored.deviceId) : undefined;
      if (session && self?.status === "active" && session.epochKeys.size < data.state.currentEpoch) {
        const { wraps } = await api<{ wraps: WrapRecord[] }>(`/api/admin/e2ee/wraps?recipient=${self.deviceId}`);
        const epochKeys = await unwrapEpochKeys(wraps, self.deviceId, session.keys.ecdhPrivate);
        unlockedRef.current = { ...session, epochKeys };
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load encryption status");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Initial load; later calls go through refresh().
    (async () => {
      if (active) await refresh();
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const thisDevice = useMemo(
    () => (identity && overview ? (overview.devices.find(d => d.deviceId === identity.deviceId) ?? null) : null),
    [identity, overview]
  );

  const status: E2eeStatus = useMemo(() => {
    if (!loaded) return "loading";
    if (error || !overview) return "error";
    if (!identity || !thisDevice) return overview.state.enabled ? "no-device" : "not-setup";
    if (thisDevice.status === "revoked") return "revoked";
    if (thisDevice.status === "pending") return overview.state.enabled ? "pending" : "not-setup";
    return isUnlocked ? "unlocked" : "locked";
  }, [loaded, error, overview, identity, thisDevice, isUnlocked]);

  const setUnlocked = (value: Unlocked | null) => {
    unlockedRef.current = value;
    if (!value) decryptCache.current.clear();
    setIsUnlocked(value !== null);
  };

  const openKeys = useCallback(async (stored: StoredDeviceIdentity, passphrase?: string) => {
    let kek: CryptoKey;
    if (stored.unlock.method === "prf") {
      const { output } = await evaluatePrf({
        salt: fromBase64Url(stored.unlock.salt),
        credentialId: stored.unlock.credentialId,
        rpId: window.location.hostname
      });
      kek = await kekFromPrf(output, stored.deviceId);
    } else {
      if (!passphrase) throw new Error("Enter your encryption passphrase");
      kek = await kekFromPassphrase(passphrase, fromBase64Url(stored.unlock.salt), stored.unlock.iterations);
    }
    try {
      return await openDeviceKeys(stored.sealed, kek, stored.deviceId);
    } catch {
      throw new Error(stored.unlock.method === "prf" ? "That passkey doesn't unlock this device" : "Wrong passphrase");
    }
  }, []);

  const createDevice = useCallback<E2eeContextValue["createDevice"]>(
    async ({ name, method, passphrase }) => {
      if (!overview) throw new Error("Not loaded");
      const deviceId = newDeviceId();
      const keys = await generateDeviceKeys();
      const salt = randomBytes(32);
      let kek: CryptoKey;
      let unlock: StoredDeviceIdentity["unlock"];
      if (method === "prf") {
        const prf = await evaluatePrf({ salt, rpId: window.location.hostname });
        kek = await kekFromPrf(prf.output, deviceId);
        unlock = { method: "prf", credentialId: prf.credentialId, salt: toBase64Url(salt) };
      } else {
        kek = await kekFromPassphrase(passphrase ?? "", salt);
        unlock = { method: "passphrase", salt: toBase64Url(salt), iterations: PBKDF2_ITERATIONS };
      }
      const identityRecord: StoredDeviceIdentity = {
        uid: overview.me.uid,
        deviceId,
        name,
        ecdhPublic: await exportPublicJwk(keys.ecdh.publicKey),
        ecdsaPublic: await exportPublicJwk(keys.ecdsa.publicKey),
        sealed: await sealDeviceKeys(keys, kek, deviceId),
        unlock,
        createdAt: new Date().toISOString()
      };
      await api("/api/admin/e2ee/devices", {
        deviceId,
        name,
        ecdhPublic: identityRecord.ecdhPublic,
        ecdsaPublic: identityRecord.ecdsaPublic,
        unlock: method
      });
      await saveIdentity(identityRecord);
      // Keep the keys open for this session (needed right away for setup).
      setUnlocked({ identity: identityRecord, keys: await openDeviceKeys(identityRecord.sealed, kek, deviceId), epochKeys: new Map() });
      await refresh();
    },
    [overview, refresh]
  );

  const forgetThisDevice = useCallback(async () => {
    if (!overview) return;
    const stored = await loadIdentity(overview.me.uid);
    if (stored && thisDevice?.status === "pending") {
      await fetch(`/api/admin/e2ee/devices/${stored.deviceId}`, { method: "DELETE" });
    }
    await deleteIdentity(overview.me.uid);
    clearLocalDrafts();
    setUnlocked(null);
    await refresh();
  }, [overview, refresh, thisDevice]);

  const unlock = useCallback<E2eeContextValue["unlock"]>(
    async passphrase => {
      if (!identity) throw new Error("This browser has no encryption keys yet");
      const keys = await openKeys(identity, passphrase);
      // A pending device has no workspace keys yet, but its own keys are still needed (e.g. for recovery).
      let epochKeys: EpochKeys = new Map();
      if (thisDevice?.status === "active") {
        const { wraps } = await api<{ wraps: WrapRecord[] }>(`/api/admin/e2ee/wraps?recipient=${identity.deviceId}`);
        epochKeys = await unwrapEpochKeys(wraps, identity.deviceId, keys.ecdhPrivate);
      }
      setUnlocked({ identity, keys, epochKeys });
    },
    [identity, openKeys, thisDevice]
  );

  const lock = useCallback(() => setUnlocked(null), []);

  const requireUnlocked = () => {
    if (!unlockedRef.current) throw new Error("Unlock encryption on this device first");
    return unlockedRef.current;
  };

  const toPublicRecords = (devices: DeviceView[]): DevicePublicRecord[] =>
    devices.map(d => ({ deviceId: d.deviceId, uid: d.uid, name: d.name, ecdhPublic: d.ecdhPublic, ecdsaPublic: d.ecdsaPublic, status: d.status, unlock: d.unlock }));

  const prepareRecoveryKey = useCallback(async (): Promise<PreparedRecovery> => {
    const recovery = await generateRecoveryKey();
    return { printable: recovery.printable, recoveryPublic: recovery.publicJwk, recoveryCheck: await createRecoveryCheck(recovery.publicJwk) };
  }, []);

  const finishBootstrap = useCallback<E2eeContextValue["finishBootstrap"]>(
    async (prepared, trustees) => {
      const session = requireUnlocked();
      const device = toPublicRecords(overview?.devices ?? []).find(d => d.deviceId === session.identity.deviceId);
      if (!device) throw new Error("Register this device first");
      const initial = await createInitialEpoch({ device: { ...device, status: "active" }, recoveryPublic: prepared.recoveryPublic });
      await api("/api/admin/e2ee/bootstrap", {
        deviceId: device.deviceId,
        epoch: initial.epoch,
        wraps: initial.wraps,
        recoveryPublic: prepared.recoveryPublic,
        recoveryCheck: prepared.recoveryCheck,
        trustees: trustees.map(name => ({ name })),
        trusteesConfirmed: true
      });
      setUnlocked({ ...session, epochKeys: initial.keys });
      await refresh();
    },
    [overview, refresh]
  );

  const approveDevice = useCallback<E2eeContextValue["approveDevice"]>(
    async deviceId => {
      const session = requireUnlocked();
      const target = toPublicRecords(overview?.devices ?? []).find(d => d.deviceId === deviceId);
      if (!target) throw new Error("Device not found");
      const wraps = await wrapAllEpochsForDevice(session.epochKeys, target);
      await api(`/api/admin/e2ee/devices/${deviceId}/approve`, {
        wraps,
        via: { kind: "device", approverDeviceId: session.identity.deviceId }
      });
      await refresh();
    },
    [overview, refresh]
  );

  const rotate = useCallback<E2eeContextValue["rotate"]>(
    async revokeDeviceIds => {
      const session = requireUnlocked();
      if (!overview?.state.recoveryPublic) throw new Error("Encryption is not set up");
      const devices = toPublicRecords(overview.devices).map(d =>
        revokeDeviceIds.includes(d.deviceId) ? { ...d, status: "revoked" as const } : d
      );
      const rotated = await rotateEpoch({
        keys: session.epochKeys,
        createdByDevice: session.identity.deviceId,
        activeDevices: devices,
        recoveryPublic: overview.state.recoveryPublic
      });
      await api("/api/admin/e2ee/rotate", {
        byDeviceId: session.identity.deviceId,
        revokeDeviceIds,
        epoch: rotated.epoch,
        wraps: rotated.wraps
      });
      setUnlocked({ ...session, epochKeys: rotated.keys });
      await refresh();
    },
    [overview, refresh]
  );

  const unwrapWithRecovery = useCallback(
    async (printable: string) => {
      if (!overview?.state.recoveryPublic || !overview.state.recoveryCheckWrap) throw new Error("Encryption is not set up");
      const recoveryPrivate = await importRecoveryPrivateKey(printable, overview.state.recoveryPublic);
      const { wraps } = await api<{ wraps: WrapRecord[] }>("/api/admin/e2ee/wraps?recipient=recovery");
      let epochKeys: EpochKeys;
      let token: string;
      try {
        epochKeys = await unwrapEpochKeys(wraps, "recovery", recoveryPrivate);
        token = await answerRecoveryCheck(overview.state.recoveryCheckWrap, recoveryPrivate);
      } catch {
        throw new Error("This recovery key doesn't belong to this workspace (or was replaced).");
      }
      return { epochKeys, token };
    },
    [overview]
  );

  const recoverThisDevice = useCallback<E2eeContextValue["recoverThisDevice"]>(
    async printable => {
      const session = requireUnlocked();
      const self = toPublicRecords(overview?.devices ?? []).find(d => d.deviceId === session.identity.deviceId);
      if (!self) throw new Error("Register this device first");
      const { epochKeys, token } = await unwrapWithRecovery(printable);
      await api(`/api/admin/e2ee/devices/${self.deviceId}/approve`, {
        wraps: await wrapAllEpochsForDevice(epochKeys, self),
        via: { kind: "recovery", recoveryToken: token }
      });
      setUnlocked({ ...session, epochKeys });
      await refresh();
    },
    [overview, refresh, unwrapWithRecovery]
  );

  const checkRecoveryKey = useCallback<E2eeContextValue["checkRecoveryKey"]>(
    async printable => (await unwrapWithRecovery(printable)).epochKeys.size,
    [unwrapWithRecovery]
  );

  const finishRecoveryReplacement = useCallback<E2eeContextValue["finishRecoveryReplacement"]>(
    async (prepared, trustees) => {
      const session = requireUnlocked();
      await api("/api/admin/e2ee/recovery", {
        recoveryPublic: prepared.recoveryPublic,
        recoveryCheck: prepared.recoveryCheck,
        wraps: await wrapAllEpochsForRecovery(session.epochKeys, prepared.recoveryPublic),
        trustees: trustees.map(name => ({ name })),
        trusteesConfirmed: true
      });
      await refresh();
    },
    [refresh]
  );

  const encrypt = useCallback<E2eeContextValue["encrypt"]>(async (location, data) => {
    const session = requireUnlocked();
    const epoch = currentEpoch(session.epochKeys);
    if (!epoch) throw new Error("No encryption key yet");
    return encryptRecord({
      data,
      location,
      epoch,
      workspaceKey: await aesKeyFromRaw(session.epochKeys.get(epoch)!),
      deviceId: session.identity.deviceId,
      signingKey: session.keys.ecdsaPrivate
    });
  }, []);

  const decrypt = useCallback(
    async <T,>(envelope: unknown, location: RecordLocation) => {
      const session = requireUnlocked();
      return decryptRecord<T>(envelope, location, {
        workspaceKeyFor: async epoch => (session.epochKeys.has(epoch) ? aesKeyFromRaw(session.epochKeys.get(epoch)!) : null),
        signingKeyFor: deviceId => overviewRef.current?.devices.find(d => d.deviceId === deviceId)?.ecdsaPublic ?? null
      });
    },
    []
  );

  const openSealedSignature = useCallback<E2eeContextValue["openSealedSignature"]>(async (sealed, sessionId) => {
    const session = requireUnlocked();
    const epochRecord = overviewRef.current?.epochs.find(e => e.epoch === sealed.epoch);
    const raw = session.epochKeys.get(sealed.epoch);
    if (!epochRecord || !raw) throw new Error("This device doesn't have the key for that signature");
    const sealingPrivate = await openSealingPrivateKey(await aesKeyFromRaw(raw), sealed.epoch, epochRecord.sealingPrivate);
    return openSignature(sealed, sealingPrivate, sessionId);
  }, []);

  const packPrivate = useCallback<E2eeContextValue["packPrivate"]>(
    async (location, privateFields) => {
      if (!overviewRef.current?.state.enabled) return privateFields;
      return { enc: await encrypt(location, privateFields) };
    },
    [encrypt]
  );

  const unpackPrivate = useCallback<E2eeContextValue["unpackPrivate"]>(
    async <T extends Record<string, unknown>>(raw: Record<string, unknown>, location: RecordLocation) => {
      const { enc, ...rest } = raw;
      if (enc === undefined) return { ...raw, _e2ee: "legacy" } as Unpacked<T>;
      const cacheKey = `${location.path}/${location.docId}:${(enc as { sig?: string }).sig ?? ""}`;
      try {
        let fields = decryptCache.current.get(cacheKey);
        if (!fields) {
          fields = await decrypt<Record<string, unknown>>(enc, location);
          decryptCache.current.set(cacheKey, fields);
        }
        return { ...rest, ...fields, _e2ee: "encrypted" } as Unpacked<T>;
      } catch (err) {
        return { ...rest, _e2ee: "failed", _e2eeError: err instanceof Error ? err.message : "Could not decrypt" } as Unpacked<T>;
      }
    },
    [decrypt]
  );

  const value: E2eeContextValue = {
    status,
    enabled: Boolean(overview?.state.enabled),
    keysOpen: isUnlocked,
    error,
    overview,
    identity,
    thisDevice,
    refresh,
    createDevice,
    forgetThisDevice,
    unlock,
    lock,
    prepareRecoveryKey,
    finishBootstrap,
    approveDevice,
    rotate,
    recoverThisDevice,
    checkRecoveryKey,
    finishRecoveryReplacement,
    encrypt,
    decrypt,
    openSealedSignature,
    packPrivate,
    unpackPrivate
  };

  return <E2eeContext.Provider value={value}>{children}</E2eeContext.Provider>;
}

export function useE2ee() {
  const value = useContext(E2eeContext);
  if (!value) throw new Error("useE2ee must be used inside <E2eeProvider>");
  return value;
}
