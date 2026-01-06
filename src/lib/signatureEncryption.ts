import "server-only";

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

type EncryptedPayload = {
  alg: "AES-256-GCM";
  iv: string;
  ciphertext: string;
  tag: string;
};

function getKey(): Buffer {
  const raw = process.env.DOCGEN_SIGNATURE_ENC_KEY_BASE64;
  if (!raw) {
    throw new Error("DOCGEN_SIGNATURE_ENC_KEY_BASE64 is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DOCGEN_SIGNATURE_ENC_KEY_BASE64 must decode to 32 bytes");
  }
  return key;
}

export function encryptSignature(bytes: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64")
  };
}

export function decryptSignature(payload: EncryptedPayload): Buffer {
  if (payload.alg !== "AES-256-GCM") {
    throw new Error("Unsupported signature encryption algorithm");
  }
  const iv = Buffer.from(payload.iv, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function parsePngDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    throw new Error("Signature must be a PNG data URL");
  }
  return Buffer.from(match[1], "base64");
}

export function toPngDataUrl(bytes: Buffer) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
