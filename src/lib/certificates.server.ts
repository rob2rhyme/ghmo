import "server-only";
import crypto from "node:crypto";

/**
 * Verification records for signed certificates. The QR code on a certificate leads to
 * /verify/{code}, which shows this record. The record carries an HMAC made with a key that is
 * not in the database, so someone who can only write to Firestore can't invent a valid one.
 * The record holds no personal details: just the certificate number, template, issue time and
 * the SHA-256 of the exact PDF that was issued.
 */

export const VERIFICATION_CODE_PATTERN = /^[A-Z2-7]{16}$/;
export const CERTIFICATES_COLLECTION = "certificates";

export type CertificateRecord = {
  code: string;
  certificateId: string;
  templateId: string;
  templateTitle: string;
  templateVersion: number;
  issuedAt: string;
  issuedByUid: string;
  pdfSha256: string;
  signature: string;
  status: "valid" | "revoked";
};

type Signed = Pick<CertificateRecord, "code" | "certificateId" | "templateId" | "templateVersion" | "issuedAt" | "pdfSha256">;

function signingKey(): Buffer {
  const raw = process.env.CERTIFICATE_SIGNING_KEY_BASE64;
  if (!raw) throw new CertificateKeyError("CERTIFICATE_SIGNING_KEY_BASE64 is not set");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length < 32) throw new CertificateKeyError("CERTIFICATE_SIGNING_KEY_BASE64 must decode to at least 32 bytes");
  return key;
}

export class CertificateKeyError extends Error {}

export function isCertificateSigningConfigured(): boolean {
  try {
    signingKey();
    return true;
  } catch {
    return false;
  }
}

function canonical(fields: Signed) {
  return ["ghmo-cert-v1", fields.code, fields.certificateId, fields.templateId, fields.templateVersion, fields.issuedAt, fields.pdfSha256].join("|");
}

export function signCertificate(fields: Signed): string {
  return crypto.createHmac("sha256", signingKey()).update(canonical(fields), "utf8").digest("hex");
}

export function certificateSignatureIsValid(record: CertificateRecord): boolean {
  try {
    const expected = Buffer.from(signCertificate(record), "hex");
    const actual = Buffer.from(record.signature, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** What a visitor may see. Returns null if the record is missing or its signature doesn't check out. */
export function publicCertificateView(record: CertificateRecord | undefined) {
  if (!record || !certificateSignatureIsValid(record)) return null;
  return {
    code: record.code,
    certificateId: record.certificateId,
    templateTitle: record.templateTitle,
    issuedAt: record.issuedAt,
    status: record.status,
    pdfSha256: record.pdfSha256
  };
}
