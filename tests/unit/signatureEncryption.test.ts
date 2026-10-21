import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSignature,
  encryptSignature,
  parsePngDataUrl,
  toPngDataUrl
} from "@/src/lib/signatureEncryption";

const ENV = "DOCGEN_SIGNATURE_ENC_KEY_BASE64";

describe("signatureEncryption", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env[ENV];
    process.env[ENV] = crypto.randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (previous === undefined) delete process.env[ENV];
    else process.env[ENV] = previous;
  });

  it("round-trips bytes", () => {
    const bytes = crypto.randomBytes(512);
    const enc = encryptSignature(bytes);
    expect(enc.alg).toBe("AES-256-GCM");
    expect(decryptSignature(enc).equals(bytes)).toBe(true);
  });

  it("uses a fresh IV each time", () => {
    const bytes = Buffer.from("same input");
    expect(encryptSignature(bytes).iv).not.toBe(encryptSignature(bytes).iv);
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSignature(Buffer.from("signature"));
    const ct = Buffer.from(enc.ciphertext, "base64");
    ct[0] ^= 0xff;
    expect(() => decryptSignature({ ...enc, ciphertext: ct.toString("base64") })).toThrow();
  });

  it("rejects a wrong key", () => {
    const enc = encryptSignature(Buffer.from("signature"));
    process.env[ENV] = crypto.randomBytes(32).toString("base64");
    expect(() => decryptSignature(enc)).toThrow();
  });

  it("refuses keys that are not 32 bytes", () => {
    process.env[ENV] = crypto.randomBytes(16).toString("base64");
    expect(() => encryptSignature(Buffer.from("x"))).toThrow(/32 bytes/);
  });

  it("refuses a missing key", () => {
    delete process.env[ENV];
    expect(() => encryptSignature(Buffer.from("x"))).toThrow(/not set/);
  });

  it("parses only PNG data URLs", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(parsePngDataUrl(toPngDataUrl(bytes)).equals(bytes)).toBe(true);
    expect(() => parsePngDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => parsePngDataUrl("javascript:alert(1)")).toThrow();
  });
});
