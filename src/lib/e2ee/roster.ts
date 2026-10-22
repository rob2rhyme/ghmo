/**
 * Signed device roster (plan Phase 7: closes review findings R1/R2/R9).
 *
 * The server stores public keys and wrapped keys, but it could swap them: add a device, change the
 * recovery key, replace a wrap or a sealing key. To make that detectable, every change to who holds
 * keys is an entry in an append-only log, signed by a device that was already trusted, and each entry
 * commits to the one before it (hash chain). Clients replay the log themselves, compare the result
 * with what the server says, and pin the newest entry they have seen so history can't be rewritten.
 *
 *   genesis   the first device(s), the recovery public key, each epoch's sealing key, hashes of every wrap
 *   add       a device was approved (by an active device, or by the recovery key)
 *   rotate    a new epoch: which devices were revoked, who holds the new key, the new sealing key
 *   recovery  the recovery key was replaced
 *
 * What this does NOT do: authenticate the very first entry. A device joining for the first time trusts the
 * log's first entry unless a person compares the workspace fingerprint with an existing admin (see
 * workspaceFingerprint). Everything after that first entry is checked.
 */
import { utf8 } from "./encoding";
import { signBytes, verifyBytes, type PublicJwk } from "./keys";
import type { WrapRecord } from "./keyring";

export const RECOVERY_SIGNER = "recovery";
const SIGN_PREFIX = "ghmo-e2ee/roster/v1|";

export type RosterKey = { x: string; y: string };
export type RosterDevice = { id: string; uid: string; ecdh: RosterKey; ecdsa: RosterKey };
export type WrapDigest = { epoch: number; recipient: string; h: string };

export type GenesisBody = {
  devices: RosterDevice[];
  recovery: RosterKey;
  epochs: { epoch: number; sealing: RosterKey }[];
  wraps: WrapDigest[];
};
export type AddBody = { device: RosterDevice; via: "device" | "recovery"; wraps: WrapDigest[] };
export type RotateBody = { epoch: number; sealing: RosterKey; revoked: string[]; devices: string[]; wraps: WrapDigest[] };
export type RecoveryBody = { recovery: RosterKey; wraps: WrapDigest[] };

type Base = { v: 1; seq: number; prev: string; by: string; at: string; sig: string };
export type RosterEntry =
  | (Base & { type: "genesis"; body: GenesisBody })
  | (Base & { type: "add"; body: AddBody })
  | (Base & { type: "rotate"; body: RotateBody })
  | (Base & { type: "recovery"; body: RecoveryBody });
export type UnsignedEntry = DistributiveOmit<RosterEntry, "sig">;
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class RosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterError";
  }
}

export type RosterState = {
  head: { seq: number; hash: string };
  genesisHash: string;
  devices: Map<string, RosterDevice>;
  /** Every device that was active and later revoked (kept so records they signed can still be checked). */
  revoked: Map<string, RosterDevice>;
  recovery: RosterKey;
  currentEpoch: number;
  epochs: Map<number, { sealing: RosterKey; wraps: Map<string, string> }>;
};

// ---------- encoding ----------

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", utf8(text)));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

/** Hash of a whole entry, signature included, so the chain commits to who signed what. */
export const entryHash = (entry: RosterEntry) => sha256Hex(canonicalJson(entry));

const signingBytes = (entry: UnsignedEntry) => utf8(SIGN_PREFIX + canonicalJson(entry));

export const rosterKey = (jwk: PublicJwk | RosterKey): RosterKey => ({ x: jwk.x, y: jwk.y });
export const rosterKeyToJwk = (key: RosterKey): PublicJwk => ({ kty: "EC", crv: "P-256", x: key.x, y: key.y });
const sameKey = (a: RosterKey, b: RosterKey) => a.x === b.x && a.y === b.y;
const sameDevice = (a: RosterDevice, b: RosterDevice) => a.id === b.id && a.uid === b.uid && sameKey(a.ecdh, b.ecdh) && sameKey(a.ecdsa, b.ecdsa);

export function rosterDevice(d: { deviceId: string; uid: string; ecdhPublic: PublicJwk; ecdsaPublic: PublicJwk }): RosterDevice {
  return { id: d.deviceId, uid: d.uid, ecdh: rosterKey(d.ecdhPublic), ecdsa: rosterKey(d.ecdsaPublic) };
}

export async function wrapDigest(w: WrapRecord): Promise<WrapDigest> {
  return { epoch: w.epoch, recipient: w.recipient, h: await sha256Hex(canonicalJson({ epoch: w.epoch, recipient: w.recipient, wrap: w.wrap })) };
}

export async function wrapDigests(wraps: WrapRecord[]): Promise<WrapDigest[]> {
  return (await Promise.all(wraps.map(wrapDigest))).sort(compareDigest);
}

const compareDigest = (a: WrapDigest, b: WrapDigest) => a.epoch - b.epoch || (a.recipient < b.recipient ? -1 : a.recipient > b.recipient ? 1 : 0);
const digestKey = (d: { epoch: number; recipient: string }) => `${d.epoch}|${d.recipient}`;

// ---------- building entries ----------

export async function signEntry(unsigned: UnsignedEntry, signingKey: CryptoKey): Promise<RosterEntry> {
  return { ...unsigned, sig: await signBytes(signingKey, signingBytes(unsigned)) } as RosterEntry;
}

/** Fields every new entry needs, given the log so far. */
export async function nextLink(log: RosterEntry[]): Promise<{ seq: number; prev: string }> {
  const last = log[log.length - 1];
  return last ? { seq: last.seq + 1, prev: await entryHash(last) } : { seq: 1, prev: "" };
}

// ---------- verifying ----------

function need(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RosterError(message);
}

function sameSet(actual: Iterable<string>, expected: Iterable<string>, what: string) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  need(a.length === e.length && a.every((v, i) => v === e[i]), `${what} don't match`);
}

/** The digests must be exactly the expected (epoch, recipient) pairs, once each. */
function checkDigests(wraps: WrapDigest[], expected: { epoch: number; recipient: string }[], what: string) {
  need(new Set(wraps.map(digestKey)).size === wraps.length, `${what}: duplicate key copies`);
  sameSet(wraps.map(digestKey), expected.map(digestKey), `${what}: key copies`);
}

async function signerKey(entry: RosterEntry, state: RosterState | null): Promise<RosterKey> {
  if (!state) {
    need(entry.type === "genesis", "The log must start with a genesis entry");
    const device = entry.body.devices.find(d => d.id === entry.by);
    need(device, "The first entry must be signed by one of its own devices");
    return device.ecdsa;
  }
  if (entry.by === RECOVERY_SIGNER) {
    need(entry.type === "add" && entry.body.via === "recovery", "Only a recovery approval may be signed by the recovery key");
    return state.recovery;
  }
  const device = state.devices.get(entry.by);
  need(device, "Signed by a device that was not trusted at that point");
  return device.ecdsa;
}

function freshState(entry: RosterEntry & { type: "genesis" }, hash: string): RosterState {
  const b = entry.body;
  need(b.devices.length >= 1 && new Set(b.devices.map(d => d.id)).size === b.devices.length, "Genesis needs at least one device, each once");
  need(b.epochs.length >= 1 && b.epochs.every((e, i) => e.epoch === i + 1), "Genesis epochs must be 1..N");
  const expected: { epoch: number; recipient: string }[] = [];
  for (const e of b.epochs) {
    expected.push({ epoch: e.epoch, recipient: RECOVERY_SIGNER });
    for (const d of b.devices) expected.push({ epoch: e.epoch, recipient: d.id });
  }
  checkDigests(b.wraps, expected, "Genesis");
  const epochs = new Map<number, { sealing: RosterKey; wraps: Map<string, string> }>();
  for (const e of b.epochs) epochs.set(e.epoch, { sealing: e.sealing, wraps: new Map() });
  for (const w of b.wraps) epochs.get(w.epoch)!.wraps.set(w.recipient, w.h);
  return {
    head: { seq: 1, hash },
    genesisHash: hash,
    devices: new Map(b.devices.map(d => [d.id, d])),
    revoked: new Map(),
    recovery: b.recovery,
    currentEpoch: b.epochs.length,
    epochs
  };
}

function applyEntry(state: RosterState, entry: RosterEntry, hash: string): RosterState {
  const next: RosterState = {
    ...state,
    head: { seq: entry.seq, hash },
    devices: new Map(state.devices),
    revoked: new Map(state.revoked),
    epochs: new Map([...state.epochs].map(([n, e]) => [n, { sealing: e.sealing, wraps: new Map(e.wraps) }]))
  };
  switch (entry.type) {
    case "genesis":
      throw new RosterError("Only the first entry may be a genesis entry");

    case "add": {
      const { device, wraps, via } = entry.body;
      need(!state.devices.has(device.id) && !state.revoked.has(device.id), "That device id was already used");
      need((entry.by === RECOVERY_SIGNER) === (via === "recovery"), "The approval type doesn't match who signed it");
      need(device.id !== entry.by, "A device cannot approve itself");
      checkDigests(
        wraps,
        Array.from({ length: state.currentEpoch }, (_, i) => ({ epoch: i + 1, recipient: device.id })),
        "Approval"
      );
      next.devices.set(device.id, device);
      for (const w of wraps) next.epochs.get(w.epoch)!.wraps.set(w.recipient, w.h);
      return next;
    }

    case "rotate": {
      const b = entry.body;
      need(b.epoch === state.currentEpoch + 1, "Rotation must start the next epoch");
      need(new Set(b.revoked).size === b.revoked.length && b.revoked.every(id => state.devices.has(id)), "Revoked devices must be active devices");
      need(!b.revoked.includes(entry.by), "A device cannot revoke itself");
      const remaining = [...state.devices.keys()].filter(id => !b.revoked.includes(id));
      sameSet(b.devices, remaining, "The devices that keep access");
      checkDigests(b.wraps, [...remaining, RECOVERY_SIGNER].map(recipient => ({ epoch: b.epoch, recipient })), "Rotation");
      for (const id of b.revoked) {
        next.revoked.set(id, state.devices.get(id)!);
        next.devices.delete(id);
        for (const e of next.epochs.values()) e.wraps.delete(id);
      }
      const wraps = new Map<string, string>();
      for (const w of b.wraps) wraps.set(w.recipient, w.h);
      next.epochs.set(b.epoch, { sealing: b.sealing, wraps });
      next.currentEpoch = b.epoch;
      return next;
    }

    case "recovery": {
      const b = entry.body;
      checkDigests(
        b.wraps,
        Array.from({ length: state.currentEpoch }, (_, i) => ({ epoch: i + 1, recipient: RECOVERY_SIGNER })),
        "Recovery key change"
      );
      next.recovery = b.recovery;
      for (const w of b.wraps) next.epochs.get(w.epoch)!.wraps.set(RECOVERY_SIGNER, w.h);
      return next;
    }
  }
}

/** Replays the whole log. Throws RosterError at the first entry that doesn't check out. */
export async function verifyRoster(log: RosterEntry[]): Promise<RosterState> {
  need(log.length > 0, "The device log is empty");
  let state: RosterState | null = null;
  let prevHash = "";
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    need(entry.v === 1, `Entry ${i + 1}: unknown version`);
    need(entry.seq === i + 1, `Entry ${i + 1}: out of order`);
    need(entry.prev === prevHash, `Entry ${entry.seq}: doesn't follow the previous entry`);
    const { sig, ...unsigned } = entry;
    const signer = await signerKey(entry, state);
    const valid = await verifyBytes(rosterKeyToJwk(signer), sig, signingBytes(unsigned as UnsignedEntry)).catch(() => false);
    need(valid, `Entry ${entry.seq}: signature is not valid`);
    const hash = await entryHash(entry);
    state = state ? applyEntry(state, entry, hash) : freshState(entry as RosterEntry & { type: "genesis" }, hash);
    prevHash = hash;
  }
  return state!;
}

// ---------- checking the server against the log ----------

export type ServerKeyring = {
  devices: { deviceId: string; uid: string; status: string; ecdhPublic: PublicJwk; ecdsaPublic: PublicJwk }[];
  recoveryPublic: PublicJwk | null;
  currentEpoch: number;
  epochs: { epoch: number; sealingPublic: PublicJwk }[];
};

/** The keyring part of the overview the API returns, in the shape the checks expect. */
export function keyringFromOverview(overview: {
  state: { recoveryPublic: PublicJwk | null; currentEpoch: number };
  devices: ServerKeyring["devices"];
  epochs: ServerKeyring["epochs"];
}): ServerKeyring {
  return { devices: overview.devices, recoveryPublic: overview.state.recoveryPublic, currentEpoch: overview.state.currentEpoch, epochs: overview.epochs };
}

/** What the server says must be exactly what the signed log says. */
export function checkServerAgainstRoster(state: RosterState, server: ServerKeyring): void {
  for (const d of server.devices) {
    if (d.status === "active") {
      const trusted = state.devices.get(d.deviceId);
      need(trusted, `The server lists an active device the log never approved (${d.deviceId.slice(0, 6)}…)`);
      need(sameDevice(trusted, rosterDevice(d)), "The server's keys for a device differ from the signed log");
    } else if (d.status === "revoked") {
      need(state.revoked.has(d.deviceId), "The server lists a revoked device the log doesn't know");
    }
  }
  for (const id of state.devices.keys()) {
    need(server.devices.some(d => d.deviceId === id && d.status === "active"), "The server hides or demotes a device the log approved");
  }
  need(server.recoveryPublic && sameKey(rosterKey(server.recoveryPublic), state.recovery), "The server's recovery key differs from the signed log");
  need(server.currentEpoch === state.currentEpoch, "The server's current epoch differs from the signed log");
  sameSet(server.epochs.map(e => String(e.epoch)), [...state.epochs.keys()].map(String), "The server's epochs");
  for (const e of server.epochs) {
    need(sameKey(rosterKey(e.sealingPublic), state.epochs.get(e.epoch)!.sealing), `The server's signing key for epoch ${e.epoch} differs from the signed log`);
  }
}

/** The key copies the server hands to `recipient` must be the ones the log committed to. */
export async function checkWrapsAgainstRoster(state: RosterState, recipient: string, wraps: WrapRecord[], maxEpoch = state.currentEpoch): Promise<void> {
  for (const w of wraps) {
    if (w.recipient !== recipient || w.epoch > maxEpoch) continue;
    const expected = state.epochs.get(w.epoch)?.wraps.get(recipient);
    need(expected, `The log has no key copy for epoch ${w.epoch}`);
    need((await wrapDigest(w)).h === expected, `The key copy for epoch ${w.epoch} was changed on the server`);
  }
  for (const [epoch, e] of state.epochs) {
    if (e.wraps.has(recipient) && epoch <= maxEpoch) {
      need(wraps.some(w => w.epoch === epoch && w.recipient === recipient), `The server withheld the key copy for epoch ${epoch}`);
    }
  }
}

/** The log must still contain the entry this device saw last, unchanged. */
export async function checkPin(log: RosterEntry[], pin: { seq: number; hash: string } | undefined): Promise<void> {
  if (!pin) return;
  const seen = log[pin.seq - 1];
  need(seen, "The device log is shorter than it was when this device last checked");
  need((await entryHash(seen)) === pin.hash, "The device log was rewritten since this device last checked");
}

/**
 * 20-digit workspace fingerprint from the first entry, e.g. "12345 67890 12345 67890". It never changes.
 * When a new device joins, its owner and an existing admin compare it by phone: that is what makes the
 * first entry trustworthy.
 */
export function workspaceFingerprint(genesisHash: string): string {
  let value = 0n;
  for (let i = 0; i < 32; i += 2) value = (value << 8n) | BigInt(parseInt(genesisHash.slice(i, i + 2), 16));
  const digits = (value % 10n ** 20n).toString().padStart(20, "0");
  return [0, 5, 10, 15].map(start => digits.slice(start, start + 5)).join(" ");
}


// ---------- high-level builders (used by the browser and by tests) ----------

type Signer = { id: string; key: CryptoKey };
const now = () => new Date().toISOString();

export async function genesisEntry(params: {
  signer: Signer;
  devices: RosterDevice[];
  recovery: PublicJwk | RosterKey;
  epochs: { epoch: number; sealingPublic: PublicJwk | RosterKey }[];
  wraps: WrapRecord[];
}): Promise<RosterEntry> {
  return signEntry(
    {
      v: 1,
      seq: 1,
      prev: "",
      type: "genesis",
      by: params.signer.id,
      at: now(),
      body: {
        devices: params.devices,
        recovery: rosterKey(params.recovery),
        epochs: params.epochs.map(e => ({ epoch: e.epoch, sealing: rosterKey(e.sealingPublic) })),
        wraps: await wrapDigests(params.wraps)
      }
    },
    params.signer.key
  );
}

export async function addEntry(params: {
  log: RosterEntry[];
  /** A device id, or RECOVERY_SIGNER when the paper recovery key signs. */
  signer: { id: string; key: CryptoKey };
  device: RosterDevice;
  wraps: WrapRecord[];
}): Promise<RosterEntry> {
  return signEntry(
    {
      v: 1,
      ...(await nextLink(params.log)),
      type: "add",
      by: params.signer.id,
      at: now(),
      body: { device: params.device, via: params.signer.id === RECOVERY_SIGNER ? "recovery" : "device", wraps: await wrapDigests(params.wraps) }
    },
    params.signer.key
  );
}

export async function rotateEntry(params: {
  log: RosterEntry[];
  signer: Signer;
  epoch: number;
  sealingPublic: PublicJwk | RosterKey;
  revoked: string[];
  remaining: string[];
  wraps: WrapRecord[];
}): Promise<RosterEntry> {
  return signEntry(
    {
      v: 1,
      ...(await nextLink(params.log)),
      type: "rotate",
      by: params.signer.id,
      at: now(),
      body: {
        epoch: params.epoch,
        sealing: rosterKey(params.sealingPublic),
        revoked: [...params.revoked].sort(),
        devices: [...params.remaining].sort(),
        wraps: await wrapDigests(params.wraps)
      }
    },
    params.signer.key
  );
}

export async function recoveryEntry(params: { log: RosterEntry[]; signer: Signer; recovery: PublicJwk | RosterKey; wraps: WrapRecord[] }): Promise<RosterEntry> {
  return signEntry(
    {
      v: 1,
      ...(await nextLink(params.log)),
      type: "recovery",
      by: params.signer.id,
      at: now(),
      body: { recovery: rosterKey(params.recovery), wraps: await wrapDigests(params.wraps) }
    },
    params.signer.key
  );
}
