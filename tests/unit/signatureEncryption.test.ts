import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSignature,
  encryptSignature,
  isValidSigningSessionId,
  MAX_SIGNATURE_BYTES,
  parsePngDataUrl,
  toPngDataUrl,
  type EncryptedSignature
} from "@/src/lib/signatureEncryption";

const KEY = "DOCGEN_SIGNATURE_ENC_KEY_BASE64";
const PREV = "DOCGEN_SIGNATURE_ENC_PREVIOUS_KEYS_BASE64";
const SESSION = "a".repeat(64);
const OTHER_SESSION = "b".repeat(64);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);

describe("signatureEncryption", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved[KEY] = process.env[KEY];
    saved[PREV] = process.env[PREV];
    process.env[KEY] = crypto.randomBytes(32).toString("base64");
    delete process.env[PREV];
  });
  afterEach(() => {
    for (const name of [KEY, PREV]) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("round-trips bytes and labels the key", () => {
    const enc = encryptSignature(PNG, SESSION);
    expect(enc).toMatchObject({ alg: "AES-256-GCM", v: 2 });
    expect(enc.kid).toMatch(/^[0-9a-f]{16}$/);
    expect(decryptSignature(enc, SESSION).equals(PNG)).toBe(true);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSignature(PNG, SESSION).iv).not.toBe(encryptSignature(PNG, SESSION).iv);
  });

  it("binds the ciphertext to its signing session", () => {
    const enc = encryptSignature(PNG, SESSION);
    expect(() => decryptSignature(enc, OTHER_SESSION)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSignature(PNG, SESSION);
    const ct = Buffer.from(enc.ciphertext, "base64");
    ct[0] ^= 0xff;
    expect(() => decryptSignature({ ...enc, ciphertext: ct.toString("base64") }, SESSION)).toThrow();
  });

  it("still decrypts after key rotation via the previous-keys list", () => {
    const oldKey = process.env[KEY]!;
    const enc = encryptSignature(PNG, SESSION);
    process.env[KEY] = crypto.randomBytes(32).toString("base64");
    expect(() => decryptSignature(enc, SESSION)).toThrow(/Unknown/);
    process.env[PREV] = oldKey;
    expect(decryptSignature(enc, SESSION).equals(PNG)).toBe(true);
  });

  it("decrypts legacy v1 payloads (no kid, no AAD)", () => {
    const key = Buffer.from(process.env[KEY]!, "base64");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(PNG), cipher.final()]);
    const legacy: EncryptedSignature = {
      alg: "AES-256-GCM",
      iv: iv.toString("base64"),
      ciphertext: ct.toString("base64"),
      tag: cipher.getAuthTag().toString("base64")
    };
    expect(decryptSignature(legacy, SESSION).equals(PNG)).toBe(true);
  });

  it("refuses keys that are not 32 bytes, and a missing key", () => {
    process.env[KEY] = crypto.randomBytes(16).toString("base64");
    expect(() => encryptSignature(PNG, SESSION)).toThrow(/32 bytes/);
    delete process.env[KEY];
    expect(() => encryptSignature(PNG, SESSION)).toThrow(/not set/);
  });
});

describe("parsePngDataUrl", () => {
  it("accepts a real PNG", () => {
    expect(parsePngDataUrl(toPngDataUrl(PNG)).equals(PNG)).toBe(true);
  });

  it("rejects other types, fake PNGs and oversized images", () => {
    expect(() => parsePngDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => parsePngDataUrl("javascript:alert(1)")).toThrow();
    expect(() => parsePngDataUrl(toPngDataUrl(Buffer.from("not a png at all")))).toThrow(/PNG image/);
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_SIGNATURE_BYTES)]);
    expect(() => parsePngDataUrl(toPngDataUrl(huge))).toThrow(/too large/);
  });
});

describe("isValidSigningSessionId", () => {
  it("accepts 64 lowercase hex characters only", () => {
    expect(isValidSigningSessionId(SESSION)).toBe(true);
    expect(isValidSigningSessionId("abc")).toBe(false);
    expect(isValidSigningSessionId(`${"a".repeat(63)}/`)).toBe(false);
    expect(isValidSigningSessionId("../../organizations/ghmo/admins/x")).toBe(false);
  });
});
