import { describe, expect, it } from "vitest";
import {
  aesKeyFromRaw,
  deviceSafetyCode,
  epochWrapContext,
  exportPublicJwk,
  fromBase64Url,
  generateDeviceKeys,
  generateSealingKeys,
  generateWorkspaceKey,
  kekFromPassphrase,
  kekFromPrf,
  openDeviceKeys,
  openSealingPrivateKey,
  randomBytes,
  sealDeviceKeys,
  toBase64Url,
  unwrapWithPrivateKey,
  wrapToPublicKey
} from "@/src/lib/e2ee";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33, 100]) {
      const bytes = randomBytes(length);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });
  it("rejects non-base64url input", () => {
    expect(() => fromBase64Url("ab+/")).toThrow();
  });
});

describe("device keys sealed under an unlock key", () => {
  it("round-trips with a PRF-derived key and yields non-extractable private keys", async () => {
    const keys = await generateDeviceKeys();
    const prf = randomBytes(32);
    const sealed = await sealDeviceKeys(keys, await kekFromPrf(prf, "dev-1"), "dev-1");
    const opened = await openDeviceKeys(sealed, await kekFromPrf(prf, "dev-1"), "dev-1");
    expect(opened.ecdhPrivate.extractable).toBe(false);
    expect(opened.ecdsaPrivate.extractable).toBe(false);
    expect(opened.ecdhPublic).toEqual(await exportPublicJwk(keys.ecdh.publicKey));
  });

  it("cannot be opened with a different passkey, device id or tampered data", async () => {
    const keys = await generateDeviceKeys();
    const prf = randomBytes(32);
    const sealed = await sealDeviceKeys(keys, await kekFromPrf(prf, "dev-1"), "dev-1");
    await expect(openDeviceKeys(sealed, await kekFromPrf(randomBytes(32), "dev-1"), "dev-1")).rejects.toThrow();
    await expect(openDeviceKeys(sealed, await kekFromPrf(prf, "dev-2"), "dev-2")).rejects.toThrow();
    const ct = fromBase64Url(sealed.ct);
    ct[5] ^= 1;
    await expect(openDeviceKeys({ ...sealed, ct: toBase64Url(ct) }, await kekFromPrf(prf, "dev-1"), "dev-1")).rejects.toThrow();
  });

  it("supports the passphrase fallback and enforces a minimum length", async () => {
    const keys = await generateDeviceKeys();
    const salt = randomBytes(16);
    const kek = await kekFromPassphrase("correct horse battery", salt, 1000);
    const sealed = await sealDeviceKeys(keys, kek, "dev-1");
    await expect(openDeviceKeys(sealed, await kekFromPassphrase("correct horse battery", salt, 1000), "dev-1")).resolves.toBeTruthy();
    await expect(openDeviceKeys(sealed, await kekFromPassphrase("wrong horse battery!", salt, 1000), "dev-1")).rejects.toThrow();
    await expect(kekFromPassphrase("short", salt, 1000)).rejects.toThrow(/12 characters/);
  });
});

describe("wrapping a workspace key to a device", () => {
  it("only the intended device, with the right context, can unwrap", async () => {
    const alice = await generateDeviceKeys();
    const mallory = await generateDeviceKeys();
    const wdk = generateWorkspaceKey();
    const context = epochWrapContext(1, "alice-device");
    const wrap = await wrapToPublicKey(wdk, await exportPublicJwk(alice.ecdh.publicKey), context);

    expect(await unwrapWithPrivateKey(wrap, alice.ecdh.privateKey, context)).toEqual(wdk);
    await expect(unwrapWithPrivateKey(wrap, mallory.ecdh.privateKey, context)).rejects.toThrow();
    // A wrap cannot be replayed for another epoch or recipient.
    await expect(unwrapWithPrivateKey(wrap, alice.ecdh.privateKey, epochWrapContext(2, "alice-device"))).rejects.toThrow();
  });

  it("uses a fresh ephemeral key every time", async () => {
    const alice = await generateDeviceKeys();
    const pub = await exportPublicJwk(alice.ecdh.publicKey);
    const wdk = generateWorkspaceKey();
    const a = await wrapToPublicKey(wdk, pub, "ctx");
    const b = await wrapToPublicKey(wdk, pub, "ctx");
    expect(a.epk.x).not.toBe(b.epk.x);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("workspace sealing keys", () => {
  it("lets anyone encrypt to the workspace and only key holders decrypt", async () => {
    const wdk = await aesKeyFromRaw(generateWorkspaceKey());
    const { publicJwk, sealedPrivate } = await generateSealingKeys(wdk, 3);
    const signature = randomBytes(500);
    const sealedForWorkspace = await wrapToPublicKey(signature, publicJwk, "signature/session-1");
    const privateKey = await openSealingPrivateKey(wdk, 3, sealedPrivate);
    expect(await unwrapWithPrivateKey(sealedForWorkspace, privateKey, "signature/session-1")).toEqual(signature);
    await expect(openSealingPrivateKey(await aesKeyFromRaw(generateWorkspaceKey()), 3, sealedPrivate)).rejects.toThrow();
  });
});

describe("safety codes", () => {
  it("are 12 digits, stable for the same keys and different for different keys", async () => {
    const a = await generateDeviceKeys();
    const b = await generateDeviceKeys();
    const [aEcdh, aEcdsa, bEcdh] = await Promise.all([
      exportPublicJwk(a.ecdh.publicKey),
      exportPublicJwk(a.ecdsa.publicKey),
      exportPublicJwk(b.ecdh.publicKey)
    ]);
    const code = await deviceSafetyCode(aEcdh, aEcdsa);
    expect(code).toMatch(/^\d{4} \d{4} \d{4}$/);
    expect(await deviceSafetyCode(aEcdh, aEcdsa)).toBe(code);
    expect(await deviceSafetyCode(bEcdh, aEcdsa)).not.toBe(code);
  });
});
