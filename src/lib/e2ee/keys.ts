/**
 * Key generation, wrapping and derivation for end-to-end encryption (plan §4).
 * Web Crypto only: P-256 ECDH/ECDSA, HKDF-SHA-256, AES-256-GCM, PBKDF2-SHA-256.
 * Isomorphic: runs in browsers and Node 22 (globalThis.crypto).
 */
import { concatBytes, fromBase64Url, randomBytes, toBase64Url, utf8 } from "./encoding";

const subtle = () => globalThis.crypto.subtle;

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const AES_GCM_LENGTH = 256;
export const PBKDF2_ITERATIONS = 600_000;

/** Public EC key as stored in Firestore (JWK with only the public fields). */
export type PublicJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

/** Ciphertext with its 96-bit IV, both base64url. */
export type SealedBytes = { iv: string; ct: string };

/** A value encrypted to someone's ECDH public key (ECIES-style). */
export type KeyWrap = { epk: PublicJwk; iv: string; ct: string };

export type DeviceKeyPairs = { ecdh: CryptoKeyPair; ecdsa: CryptoKeyPair };

export function toPublicJwk(jwk: JsonWebKey): PublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) throw new Error("Not a P-256 public key");
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export async function exportPublicJwk(key: CryptoKey): Promise<PublicJwk> {
  return toPublicJwk(await subtle().exportKey("jwk", key));
}

export function importEcdhPublic(jwk: PublicJwk) {
  return subtle().importKey("jwk", toPublicJwk(jwk), ECDH, true, []);
}

export function importEcdsaPublic(jwk: PublicJwk) {
  return subtle().importKey("jwk", toPublicJwk(jwk), ECDSA, true, ["verify"]);
}

/**
 * New device identity. Private keys are extractable only so they can be sealed
 * under the device's unlock key (passkey PRF or passphrase) for storage; once
 * opened again they are imported as non-extractable.
 */
export async function generateDeviceKeys(): Promise<DeviceKeyPairs> {
  const [ecdh, ecdsa] = await Promise.all([
    subtle().generateKey(ECDH, true, ["deriveBits"]),
    subtle().generateKey(ECDSA, true, ["sign", "verify"])
  ]);
  return { ecdh, ecdsa };
}

// ---------- symmetric helpers ----------

export async function aesKeyFromRaw(raw: Uint8Array<ArrayBuffer>, extractable = false) {
  if (raw.length !== 32) throw new Error("AES key must be 32 bytes");
  return subtle().importKey("raw", raw, { name: "AES-GCM", length: AES_GCM_LENGTH }, extractable, ["encrypt", "decrypt"]);
}

export async function sealBytes(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<SealedBytes> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plaintext));
  return { iv: toBase64Url(iv), ct: toBase64Url(ct) };
}

export async function openBytes(key: CryptoKey, sealed: SealedBytes, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = fromBase64Url(sealed.iv);
  if (iv.length !== 12) throw new Error("Bad IV");
  return new Uint8Array(
    await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, fromBase64Url(sealed.ct))
  ) as Uint8Array<ArrayBuffer>;
}

async function hkdfAesKey(ikm: Uint8Array<ArrayBuffer>, info: string, salt: Uint8Array<ArrayBuffer> = new Uint8Array(32)) {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8(info) },
    base,
    { name: "AES-GCM", length: AES_GCM_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------- device unlock keys (KEKs) ----------

/** Key-encryption key from a passkey's PRF output (plan §4.2). */
export async function kekFromPrf(prfOutput: Uint8Array<ArrayBuffer>, deviceId: string) {
  if (prfOutput.length < 32) throw new Error("PRF output too short");
  return hkdfAesKey(prfOutput, `ghmo-e2ee/device-kek/prf/v1/${deviceId}`);
}

/** Fallback key-encryption key from a passphrase (PBKDF2-SHA-256). */
export async function kekFromPassphrase(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS) {
  if (passphrase.length < 12) throw new Error("Passphrase must be at least 12 characters");
  const base = await subtle().importKey("raw", utf8(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: AES_GCM_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

type SealedDeviceSecrets = SealedBytes & { v: 1 };

/** Encrypts the device's private keys under its unlock key for storage in IndexedDB. */
export async function sealDeviceKeys(keys: DeviceKeyPairs, kek: CryptoKey, deviceId: string): Promise<SealedDeviceSecrets> {
  const [ecdh, ecdsa] = await Promise.all([
    subtle().exportKey("jwk", keys.ecdh.privateKey),
    subtle().exportKey("jwk", keys.ecdsa.privateKey)
  ]);
  const sealed = await sealBytes(kek, utf8(JSON.stringify({ ecdh, ecdsa })), utf8(`ghmo-e2ee/device-keys/v1/${deviceId}`));
  return { v: 1, ...sealed };
}

export type OpenedDeviceKeys = {
  ecdhPrivate: CryptoKey;
  ecdsaPrivate: CryptoKey;
  ecdhPublic: PublicJwk;
  ecdsaPublic: PublicJwk;
};

/** Decrypts sealed device keys. The resulting private keys are NOT extractable. */
export async function openDeviceKeys(sealed: SealedDeviceSecrets, kek: CryptoKey, deviceId: string): Promise<OpenedDeviceKeys> {
  const json = JSON.parse(new TextDecoder().decode(await openBytes(kek, sealed, utf8(`ghmo-e2ee/device-keys/v1/${deviceId}`)))) as {
    ecdh: JsonWebKey;
    ecdsa: JsonWebKey;
  };
  const [ecdhPrivate, ecdsaPrivate] = await Promise.all([
    subtle().importKey("jwk", json.ecdh, ECDH, false, ["deriveBits"]),
    subtle().importKey("jwk", json.ecdsa, ECDSA, false, ["sign"])
  ]);
  return { ecdhPrivate, ecdsaPrivate, ecdhPublic: toPublicJwk(json.ecdh), ecdsaPublic: toPublicJwk(json.ecdsa) };
}

// ---------- wrapping a secret to an ECDH public key ----------

function wrapInfo(context: string) {
  return `ghmo-e2ee/wrap/v1/${context}`;
}

/**
 * Encrypts `secret` so only the holder of `recipient`'s private key can read it:
 * ephemeral ECDH -> HKDF-SHA-256 -> AES-256-GCM, with `context` bound as AAD.
 */
export async function wrapToPublicKey(secret: Uint8Array<ArrayBuffer>, recipient: PublicJwk, context: string): Promise<KeyWrap> {
  const ephemeral = await subtle().generateKey(ECDH, true, ["deriveBits"]);
  const recipientKey = await importEcdhPublic(recipient);
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: recipientKey }, ephemeral.privateKey, 256));
  const epk = await exportPublicJwk(ephemeral.publicKey);
  const key = await hkdfAesKey(concatBytes(shared, utf8(epk.x), utf8(epk.y)), wrapInfo(context));
  const sealed = await sealBytes(key, secret, utf8(wrapInfo(context)));
  return { epk, ...sealed };
}

export async function unwrapWithPrivateKey(wrap: KeyWrap, recipientPrivate: CryptoKey, context: string): Promise<Uint8Array<ArrayBuffer>> {
  const epkKey = await importEcdhPublic(wrap.epk);
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: epkKey }, recipientPrivate, 256));
  const key = await hkdfAesKey(concatBytes(shared, utf8(wrap.epk.x), utf8(wrap.epk.y)), wrapInfo(context));
  return openBytes(key, wrap, utf8(wrapInfo(context)));
}

// ---------- workspace (team) keys ----------

/** New workspace data key (WDK) for an epoch: 32 random bytes. */
export function generateWorkspaceKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

/** Context string binding a WDK wrap to its epoch and recipient. */
export function epochWrapContext(epoch: number, recipient: string) {
  return `epoch/${epoch}/to/${recipient}`;
}

/**
 * Workspace sealing key pair for an epoch: anyone (e.g. an unauthenticated signer)
 * can encrypt to its public half; its private half is stored encrypted under the WDK.
 */
export async function generateSealingKeys(wdk: CryptoKey, epoch: number) {
  const pair = await subtle().generateKey(ECDH, true, ["deriveBits"]);
  const privateJwk = await subtle().exportKey("jwk", pair.privateKey);
  const sealedPrivate = await sealBytes(wdk, utf8(JSON.stringify(privateJwk)), utf8(`ghmo-e2ee/sealing/v1/${epoch}`));
  return { publicJwk: await exportPublicJwk(pair.publicKey), sealedPrivate };
}

export async function openSealingPrivateKey(wdk: CryptoKey, epoch: number, sealedPrivate: SealedBytes) {
  const jwk = JSON.parse(new TextDecoder().decode(await openBytes(wdk, sealedPrivate, utf8(`ghmo-e2ee/sealing/v1/${epoch}`))));
  return subtle().importKey("jwk", jwk, ECDH, false, ["deriveBits"]);
}

// ---------- signatures ----------

export async function signBytes(privateKey: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  return toBase64Url(new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data)));
}

export async function verifyBytes(publicJwk: PublicJwk, signature: string, data: Uint8Array<ArrayBuffer>) {
  const key = await importEcdsaPublic(publicJwk);
  return subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64Url(signature), data);
}

// ---------- fingerprints / safety codes ----------

/**
 * 12-digit safety code for a device's public keys, shown as "1234 5678 9012".
 * Two admins compare it in person or by phone before a device is approved, so a
 * malicious server cannot slip in its own key. Digits read aloud well in any language.
 */
export async function deviceSafetyCode(ecdhPublic: PublicJwk, ecdsaPublic: PublicJwk): Promise<string> {
  const canonical = utf8(`ghmo-e2ee/safety/v1|${ecdhPublic.x}|${ecdhPublic.y}|${ecdsaPublic.x}|${ecdsaPublic.y}`);
  const digest = new Uint8Array(await subtle().digest("SHA-256", canonical));
  let value = 0n;
  for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(digest[i]);
  const digits = (value % 10n ** 12n).toString().padStart(12, "0");
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

export { ECDH as ECDH_PARAMS, ECDSA as ECDSA_PARAMS };

// ---------- sealed signatures ----------
// A signer without an account encrypts their signature to the workspace sealing key;
// only an unlocked admin device can open it. The signing session ID and epoch are bound
// in, so a sealed signature can't be moved to another session.

export type SealedSignature = KeyWrap & { v: 1; epoch: number };

const signatureContext = (sessionId: string, epoch: number) => `signature/v1/${sessionId}/${epoch}`;

export async function sealSignature(png: Uint8Array<ArrayBuffer>, sealingPublic: PublicJwk, epoch: number, sessionId: string): Promise<SealedSignature> {
  return { v: 1, epoch, ...(await wrapToPublicKey(png, sealingPublic, signatureContext(sessionId, epoch))) };
}

export async function openSignature(sealed: SealedSignature, sealingPrivate: CryptoKey, sessionId: string): Promise<Uint8Array<ArrayBuffer>> {
  const { v, epoch, ...wrap } = sealed;
  if (v !== 1) throw new Error("Unsupported sealed signature");
  return unwrapWithPrivateKey(wrap, sealingPrivate, signatureContext(sessionId, epoch));
}
