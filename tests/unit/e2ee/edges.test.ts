import { describe, expect, it } from "vitest";
import {
  aesKeyFromRaw,
  bytesEqual,
  decryptRecord,
  encryptRecord,
  exportPublicJwk,
  formatRecoveryKey,
  generateDeviceKeys,
  generateWorkspaceKey,
  kekFromPrf,
  openBytes,
  parseRecoveryKey,
  randomBytes,
  sealBytes,
  toPublicJwk,
  utf8
} from "@/src/lib/e2ee";
import { isValidDeviceId, RECOVERY_RECIPIENT } from "@/src/lib/e2ee/keyring";

describe("input validation in the E2EE library", () => {
  it("bytesEqual handles different lengths and contents", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });

  it("rejects malformed keys and parameters", async () => {
    expect(() => toPublicJwk({ kty: "RSA" })).toThrow(/P-256/);
    expect(() => toPublicJwk({ kty: "EC", crv: "P-384", x: "a", y: "b" })).toThrow(/P-256/);
    await expect(aesKeyFromRaw(randomBytes(16))).rejects.toThrow(/32 bytes/);
    await expect(kekFromPrf(randomBytes(16), "dev")).rejects.toThrow(/too short/);
    await expect(formatRecoveryKey(randomBytes(31))).rejects.toThrow(/32 bytes/);
  });

  it("rejects a sealed value with a malformed IV", async () => {
    const key = await aesKeyFromRaw(generateWorkspaceKey());
    const sealed = await sealBytes(key, utf8("x"), utf8("aad"));
    await expect(openBytes(key, { ...sealed, iv: "AAAA" }, utf8("aad"))).rejects.toThrow(/Bad IV/);
  });

  it("rejects recovery keys with characters outside the alphabet", async () => {
    await expect(parseRecoveryKey("U".repeat(55))).rejects.toThrow(/Invalid character/);
    await expect(parseRecoveryKey("!".repeat(55))).rejects.toThrow(/Invalid character/);
  });

  it("rejects record locations that could make AAD ambiguous", async () => {
    const device = await generateDeviceKeys();
    const wdk = await aesKeyFromRaw(generateWorkspaceKey());
    const base = { data: {}, epoch: 1, workspaceKey: wdk, deviceId: "d", signingKey: device.ecdsa.privateKey };
    await expect(encryptRecord({ ...base, location: { path: "a|b", docId: "x" } })).rejects.toThrow(/location/);
    await expect(encryptRecord({ ...base, location: { path: "a", docId: "" } })).rejects.toThrow(/location/);
  });

  it("reports a correctly signed record under the wrong workspace key as undecryptable", async () => {
    const device = await generateDeviceKeys();
    const wdk = await aesKeyFromRaw(generateWorkspaceKey());
    const location = { path: "p", docId: "d" };
    const envelope = await encryptRecord({
      data: { a: 1 },
      location,
      epoch: 1,
      workspaceKey: wdk,
      deviceId: "dev",
      signingKey: device.ecdsa.privateKey
    });
    const signer = await exportPublicJwk(device.ecdsa.publicKey);
    const wrongKey = await aesKeyFromRaw(generateWorkspaceKey());
    await expect(
      decryptRecord(envelope, location, { workspaceKeyFor: () => wrongKey, signingKeyFor: () => signer })
    ).rejects.toThrow(/Could not decrypt/);
  });

  it("validates device ids and reserves the recovery recipient name", () => {
    expect(isValidDeviceId("abcdefghijklmnop")).toBe(true);
    expect(isValidDeviceId("short")).toBe(false);
    expect(isValidDeviceId("has/slash/abcdefghij")).toBe(false);
    expect(isValidDeviceId(RECOVERY_RECIPIENT)).toBe(false);
  });
});
