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
  recoveryReplaceMessage,
  signBytes,
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
import { answerRecoveryCheck, createRecoveryCheck, generateRecoveryKey, importRecoveryPrivateKey, importRecoverySigningKey } from "../recovery";
import {
  RECOVERY_SIGNER,
  RosterError,
  addEntry,
  checkPin,
  checkServerAgainstRoster,
  checkWrapsAgainstRoster,
  genesisEntry,
  keyringFromOverview,
  recoveryEntry,
  rosterDevice,
  rosterKeyToJwk,
  rotateEntry,
  verifyRoster,
  workspaceFingerprint,
  signEntry,
  type GenesisBody,
  type RosterEntry,
  type RosterState
} from "../roster";
import { clearLocalDrafts } from "@/src/lib/localDrafts";
import { deleteIdentity, loadIdentity, loadPins, saveIdentity, savePins, type StoredDeviceIdentity } from "./deviceStore";
import { evaluatePrf } from "./prf";
import { rollbackVerdict } from "../rollback";

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

export type E2eeStatus = "loading" | "error" | "not-setup" | "no-device" | "pending" | "locked" | "unlocked" | "revoked" | "integrity-error";

/**
 * Whether the server's key records match the signed device log this browser checks.
 *  - none: encryption isn't on
 *  - unsealed: encryption is on but the device log hasn't been started (workspaces set up before it existed)
 *  - verified: the log checks out, matches the server, and extends what this device saw last
 *  - failed: it doesn't; nothing is unlocked or shared until someone looks into it
 */
export type Integrity =
  | { status: "none" }
  | { status: "unsealed" }
  | { status: "verified"; fingerprint: string; entries: number }
  | { status: "failed"; reason: string };

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
  integrity: Integrity;
  /** Starts the signed device log for a workspace that has none (super admin). */
  sealRoster: () => Promise<void>;
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
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function newDeviceId() {
  return toBase64Url(randomBytes(18));
}

/**
 * A per-tab hint of whether encryption was on at the last check, only to decide whether to request the device
 * list alongside the overview. It never affects a security decision: the overview is always checked.
 */
const ENABLED_HINT_KEY = "ghmo-e2ee-enabled";
function readEnabledHint(): boolean | null {
  try {
    const value = sessionStorage.getItem(ENABLED_HINT_KEY);
    return value === null ? null : value === "1";
  } catch {
    return null;
  }
}
function writeEnabledHint(enabled: boolean) {
  try {
    sessionStorage.setItem(ENABLED_HINT_KEY, enabled ? "1" : "0");
  } catch {
    // storage unavailable: the next load simply requests both together
  }
}

type RosterFetch = Promise<{ ok: true; entries: RosterEntry[] } | { ok: false; error: unknown }>;

/** Starts fetching the signed device log; refresh() starts it alongside the overview to save a round trip. */
function fetchRoster(): RosterFetch {
  return api<{ entries: RosterEntry[] }>("/api/admin/e2ee/roster").then(
    ({ entries }) => ({ ok: true as const, entries }),
    error => ({ ok: false as const, error })
  );
}

/** Verifies the signed device log and compares it with the server's records and this device's pin. */
async function checkIntegrity(
  overview: { state: Overview["state"]; epochs: EpochRecord[]; devices: unknown[]; me: Overview["me"] },
  stored: StoredDeviceIdentity | null,
  rosterFetch: RosterFetch | null
): Promise<{ roster: RosterState | null; integrity: Integrity; entries: RosterEntry[] }> {
  // A device that has pinned the signed log has seen encryption on. Encryption can't be switched off from
  // the app, so "off" or an empty log afterwards means someone changed the database: fail closed (threat T4).
  const pinned = Boolean(stored?.rosterPin);
  const before = rollbackVerdict({ enabled: overview.state.enabled, logEntries: null, pinned, sawEnabled: pinned || Boolean(stored?.seenEnabled) });
  if (before.kind === "failed") return { roster: null, integrity: { status: "failed", reason: before.reason }, entries: [] };
  if (before.kind === "off") return { roster: null, integrity: { status: "none" }, entries: [] };
  const fetched = await (rosterFetch ?? fetchRoster());
  if (!fetched.ok) throw fetched.error;
  const { entries } = fetched;
  const verdict = rollbackVerdict({ enabled: true, logEntries: entries.length, pinned });
  if (verdict.kind === "failed") return { roster: null, integrity: { status: "failed", reason: verdict.reason }, entries };
  if (verdict.kind === "unsealed") return { roster: null, integrity: { status: "unsealed" }, entries };
  try {
    const roster = await verifyRoster(entries);
    await checkPin(entries, stored?.rosterPin);
    checkServerAgainstRoster(roster, keyringFromOverview(overview as Parameters<typeof keyringFromOverview>[0]));
    if (stored && (!stored.rosterPin || stored.rosterPin.seq < roster.head.seq)) {
      await saveIdentity({ ...stored, rosterPin: { ...roster.head } });
    }
    return { roster, integrity: { status: "verified", fingerprint: workspaceFingerprint(roster.genesisHash), entries: entries.length }, entries };
  } catch (error) {
    if (!(error instanceof RosterError)) throw error;
    return { roster: null, integrity: { status: "failed", reason: error.message }, entries };
  }
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
  const [integrity, setIntegrity] = useState<Integrity>({ status: "none" });
  // The verified device log, for the callbacks below (null until verified, or on workspaces without one).
  const rosterRef = useRef<RosterState | null>(null);
  const integrityRef = useRef<Integrity>({ status: "none" });
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
      // The device log is only used when encryption is on; it is requested alongside the overview, and its
      // answer is ignored when the overview says encryption is off.
      // Skipped when this tab last saw encryption off (it is then fetched after the overview if needed).
      const rosterFetch = readEnabledHint() === false ? null : fetchRoster();
      const data = await api<Omit<Overview, "devices"> & { devices: Omit<DeviceView, "safetyCode">[] }>("/api/admin/e2ee");
      const devices = await Promise.all(
        data.devices.map(async d => ({ ...d, safetyCode: await deviceSafetyCode(d.ecdhPublic, d.ecdsaPublic) }))
      );
      const stored = (await loadIdentity(data.me.uid)) ?? null;
      // Check the server's key records against the signed device log before anything uses them.
      const checked = await checkIntegrity(data, stored, rosterFetch);
      writeEnabledHint(data.state.enabled);
      // Remember that this browser has seen encryption on; from then on "off" is refused (see rollback.ts).
      if (stored && data.state.enabled && !stored.seenEnabled && checked.integrity.status !== "failed") {
        stored.seenEnabled = true;
        await saveIdentity(stored);
      }
      rosterRef.current = checked.roster;
      integrityRef.current = checked.integrity;
      setIntegrity(checked.integrity);
      setOverview({ ...data, devices });
      setIdentity(stored);
      // A device whose own keys are open (e.g. just set up) that has since been approved:
      // fetch its copies of the workspace keys now, instead of looking unlocked while empty.
      const session = unlockedRef.current;
      const self = stored ? devices.find(d => d.deviceId === stored.deviceId) : undefined;
      if (session && self?.status === "active" && session.epochKeys.size < data.state.currentEpoch) {
        const { wraps } = await api<{ wraps: WrapRecord[] }>(`/api/admin/e2ee/wraps?recipient=${self.deviceId}`);
        if (rosterRef.current) await checkWrapsAgainstRoster(rosterRef.current, self.deviceId, wraps, data.state.currentEpoch);
        const epochKeys = await unwrapEpochKeys(wraps, self.deviceId, session.keys.ecdhPrivate, { maxEpoch: data.state.currentEpoch });
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
    if (integrity.status === "failed") return "integrity-error";
    if (!identity || !thisDevice) return overview.state.enabled ? "no-device" : "not-setup";
    if (thisDevice.status === "revoked") return "revoked";
    if (thisDevice.status === "pending") return overview.state.enabled ? "pending" : "not-setup";
    return isUnlocked ? "unlocked" : "locked";
  }, [loaded, error, overview, identity, thisDevice, isUnlocked, integrity]);

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
      // Setting a device up again (after a removal, or a record the server dropped) keeps what this browser has
      // already verified, so a rollback can't be hidden behind a fresh setup.
      const previous = (await loadIdentity(overview.me.uid).catch(() => undefined)) ?? (await loadPins(overview.me.uid).catch(() => undefined));
      const identityRecord: StoredDeviceIdentity = {
        ...(previous?.rosterPin ? { rosterPin: previous.rosterPin } : {}),
        ...(previous?.seenEnabled || overview.state.enabled ? { seenEnabled: true } : {}),
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
    // Keep what this browser has verified, so a device set up here later still refuses a rollback.
    if (stored?.rosterPin || stored?.seenEnabled) {
      await savePins({ uid: overview.me.uid, rosterPin: stored.rosterPin, seenEnabled: stored.seenEnabled }).catch(() => undefined);
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
        if (rosterRef.current) await checkWrapsAgainstRoster(rosterRef.current, identity.deviceId, wraps, overview?.state.currentEpoch);
        epochKeys = await unwrapEpochKeys(wraps, identity.deviceId, keys.ecdhPrivate, { maxEpoch: overview?.state.currentEpoch });
      }
      setUnlocked({ identity, keys, epochKeys });
    },
    [identity, openKeys, thisDevice, overview?.state.currentEpoch]
  );

  const lock = useCallback(() => setUnlocked(null), []);

  // Idle lock: keys are forgotten after 15 minutes without a keypress, tap or scroll, so an unlocked
  // device left open doesn't stay readable. Passphrase devices (no biometric step) also lock as soon
  // as the tab is hidden.
  const unlockedNow = isUnlocked;
  useEffect(() => {
    if (!unlockedNow) return;
    const IDLE_MS = 15 * 60_000;
    let timer = window.setTimeout(lock, IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    for (const name of events) window.addEventListener(name, bump, { passive: true });
    const onHidden = () => {
      if (document.visibilityState === "hidden" && identity?.unlock.method === "passphrase") lock();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, bump);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [unlockedNow, lock, identity?.unlock.method]);

  const requireUnlocked = () => {
    if (integrityRef.current.status === "failed") throw new Error("The device list failed its integrity check. Don't use encryption until an admin looks into it.");
    if (!unlockedRef.current) throw new Error("Unlock encryption on this device first");
    return unlockedRef.current;
  };

  /** The newest device log, fetched and verified now (an operation's entry must extend the real head). */
  const freshLog = async (): Promise<{ log: RosterEntry[]; roster: RosterState | null }> => {
    const { entries } = await api<{ entries: RosterEntry[] }>("/api/admin/e2ee/roster");
    return { log: entries, roster: entries.length > 0 ? await verifyRoster(entries) : null };
  };
  const deviceSigner = (session: Unlocked) => ({ id: session.identity.deviceId, key: session.keys.ecdsaPrivate });

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
      // The first entry of the signed device log: this device, the recovery key, the first epoch.
      const entry = await genesisEntry({
        signer: deviceSigner(session),
        devices: [rosterDevice(device)],
        recovery: prepared.recoveryPublic,
        epochs: [{ epoch: 1, sealingPublic: initial.epoch.sealingPublic }],
        wraps: initial.wraps
      });
      await api("/api/admin/e2ee/bootstrap", {
        entry,
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
      // With a device log, the approval is a signed entry: the other devices will only trust this device because of it.
      const { log } = rosterRef.current ? await freshLog() : { log: [] };
      const entry = log.length ? await addEntry({ log, signer: deviceSigner(session), device: rosterDevice(target), wraps }) : undefined;
      await api(`/api/admin/e2ee/devices/${deviceId}/approve`, {
        wraps,
        entry,
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
      // With a device log, who keeps access and the recovery key come from the verified log, not from the server's say-so.
      const { log, roster } = rosterRef.current ? await freshLog() : { log: [], roster: null };
      const trusted = roster
        ? [...roster.devices.values()].map(d => ({
            deviceId: d.id,
            uid: d.uid,
            name: d.id,
            ecdhPublic: rosterKeyToJwk(d.ecdh),
            ecdsaPublic: rosterKeyToJwk(d.ecdsa),
            status: "active" as const,
            unlock: "prf" as const
          }))
        : toPublicRecords(overview.devices);
      const devices = trusted.map(d => (revokeDeviceIds.includes(d.deviceId) ? { ...d, status: "revoked" as const } : d));
      const rotated = await rotateEpoch({
        keys: session.epochKeys,
        createdByDevice: session.identity.deviceId,
        activeDevices: devices,
        recoveryPublic: roster ? rosterKeyToJwk(roster.recovery) : overview.state.recoveryPublic
      });
      const entry = log.length
        ? await rotateEntry({
            log,
            signer: deviceSigner(session),
            epoch: rotated.epoch.epoch,
            sealingPublic: rotated.epoch.sealingPublic,
            revoked: revokeDeviceIds,
            remaining: devices.filter(d => d.status === "active").map(d => d.deviceId),
            wraps: rotated.wraps
          })
        : undefined;
      await api("/api/admin/e2ee/rotate", {
        byDeviceId: session.identity.deviceId,
        revokeDeviceIds,
        epoch: rotated.epoch,
        wraps: rotated.wraps,
        entry
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
      if (rosterRef.current) await checkWrapsAgainstRoster(rosterRef.current, RECOVERY_SIGNER, wraps, overview.state.currentEpoch);
      let epochKeys: EpochKeys;
      let token: string;
      try {
        epochKeys = await unwrapEpochKeys(wraps, "recovery", recoveryPrivate, { maxEpoch: overview.state.currentEpoch });
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
      const wraps = await wrapAllEpochsForDevice(epochKeys, self);
      // The paper key signs this device into the log (the recovery public key in the log must be the one on the paper).
      const { log, roster } = rosterRef.current ? await freshLog() : { log: [], roster: null };
      const entry = log.length
        ? await addEntry({
            log,
            signer: { id: RECOVERY_SIGNER, key: await importRecoverySigningKey(printable, rosterKeyToJwk(roster!.recovery)) },
            device: rosterDevice(self),
            wraps
          })
        : undefined;
      await api(`/api/admin/e2ee/devices/${self.deviceId}/approve`, {
        wraps,
        entry,
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
      const issuedAt = Date.now();
      const replacementWraps = await wrapAllEpochsForRecovery(session.epochKeys, prepared.recoveryPublic);
      const { log } = rosterRef.current ? await freshLog() : { log: [] };
      const entry = log.length ? await recoveryEntry({ log, signer: deviceSigner(session), recovery: prepared.recoveryPublic, wraps: replacementWraps }) : undefined;
      await api("/api/admin/e2ee/recovery", {
        entry,
        authorization: {
          deviceId: session.identity.deviceId,
          issuedAt,
          sig: await signBytes(session.keys.ecdsaPrivate, recoveryReplaceMessage(session.identity.deviceId, issuedAt, prepared.recoveryPublic))
        },
        recoveryPublic: prepared.recoveryPublic,
        recoveryCheck: prepared.recoveryCheck,
        wraps: replacementWraps,
        trustees: trustees.map(name => ({ name })),
        trusteesConfirmed: true
      });
      await refresh();
    },
    [refresh]
  );

  const sealRoster = useCallback<E2eeContextValue["sealRoster"]>(async () => {
    const session = requireUnlocked();
    // The super admin checked the device list shown on the Encryption page (overviewRef, with its safety codes).
    // Sign the server's candidate only if it is exactly that list, so nothing can be slipped into the first entry
    // between the check and the click.
    const reviewed = overviewRef.current;
    if (!reviewed) throw new Error("Reload the Encryption page and check the device list again.");
    const { candidate } = await api<{ candidate: GenesisBody }>("/api/admin/e2ee/roster?candidate=1");
    const entry = await signEntry(
      { v: 1, seq: 1, prev: "", type: "genesis", by: session.identity.deviceId, at: new Date().toISOString(), body: candidate },
      session.keys.ecdsaPrivate
    );
    try {
      checkServerAgainstRoster(await verifyRoster([entry]), keyringFromOverview(reviewed as Parameters<typeof keyringFromOverview>[0]));
    } catch (error) {
      if (!(error instanceof RosterError)) throw error;
      throw new Error("The device list changed since you checked it. Reload the Encryption page, check every device with its owner again, then seal.");
    }
    await api("/api/admin/e2ee/roster", { deviceId: session.identity.deviceId, entry });
    await refresh();
  }, [refresh]);

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
        // Prefer the verified device log; revoked devices stay listed there so their older records still verify.
        signingKeyFor: deviceId => {
          const trusted = rosterRef.current?.devices.get(deviceId) ?? rosterRef.current?.revoked.get(deviceId);
          if (rosterRef.current) return trusted ? rosterKeyToJwk(trusted.ecdsa) : null;
          return overviewRef.current?.devices.find(d => d.deviceId === deviceId)?.ecdsaPublic ?? null;
        }
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
      // Never write in plaintext when the device list failed its check (for example encryption reported "off"
      // on a device that has seen it on).
      if (integrityRef.current.status === "failed") throw new Error("The device list failed its integrity check. Don't use encryption until an admin looks into it.");
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
    integrity,
    sealRoster,
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
