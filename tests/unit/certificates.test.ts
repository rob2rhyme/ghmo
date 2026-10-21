import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { publicCertificateView, signCertificate, type CertificateRecord } from "@/src/lib/certificates.server";

beforeAll(() => {
  process.env.CERTIFICATE_SIGNING_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
});

const fields = {
  code: "ABCDEFGH23456723",
  certificateId: "GHMO-2026-001",
  templateId: "wedding-certificate",
  templateVersion: 1,
  issuedAt: "2026-01-01T00:00:00.000Z",
  pdfSha256: "a".repeat(64)
};
const record = (): CertificateRecord => ({ ...fields, templateTitle: "Wedding Certificate", issuedByUid: "u", status: "valid", signature: signCertificate(fields) });

describe("certificate verification records", () => {
  it("shows a genuine record without personal details", () => {
    const view = publicCertificateView(record());
    expect(view).toMatchObject({ certificateId: "GHMO-2026-001", status: "valid" });
    expect(view).not.toHaveProperty("issuedByUid");
  });

  it("rejects a record whose signed fields were altered in the database", () => {
    for (const change of [{ certificateId: "GHMO-2026-002" }, { pdfSha256: "b".repeat(64) }, { issuedAt: "2027-01-01T00:00:00.000Z" }, { templateVersion: 2 }]) {
      expect(publicCertificateView({ ...record(), ...change })).toBeNull();
    }
  });

  it("rejects a record signed with another key, or with no signature", () => {
    const forged = record();
    process.env.CERTIFICATE_SIGNING_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
    expect(publicCertificateView(forged)).toBeNull();
    expect(publicCertificateView({ ...record(), signature: "" })).toBeNull();
    expect(publicCertificateView(undefined)).toBeNull();
  });

  it("revoking changes the status but not validity of the signature", () => {
    expect(publicCertificateView({ ...record(), status: "revoked" })).toMatchObject({ status: "revoked" });
  });
});
