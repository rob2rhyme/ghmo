import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgDocumentsCollectionPath } from "@/src/lib/firestorePaths";
import { FieldValue } from "firebase-admin/firestore";
import { decryptSignature, isValidSigningSessionId } from "@/src/lib/signatureEncryption";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";
import {
  CERTIFICATES_COLLECTION,
  VERIFICATION_CODE_PATTERN,
  isCertificateSigningConfigured,
  sha256Hex,
  signCertificate,
  type CertificateRecord
} from "@/src/lib/certificates.server";
import { checkSigningSessions } from "@/src/lib/certificateChecks";
import { getState } from "@/src/lib/e2eeStore";
import { deviceBelongsTo, largeEnvelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";

export const dynamic = "force-dynamic";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
/** Certificate image cap. (The resulting PDF must still fit in a 1 MiB Firestore document.) */
const MAX_PNG_DATA_URL_CHARS = 8 * 1024 * 1024;
/** Image plus the rest of the payload. */
const MAX_FINALIZE_BODY_BYTES = MAX_PNG_DATA_URL_CHARS + 512 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const INPUT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_INPUT_FIELDS = 100;

const signingSessionIdSchema = z.string().refine(isValidSigningSessionId, { message: "Invalid signing session" });

const finalizeSchema = z.object({
  certificatePayload: z.object({
    templateId: z.string().trim().min(1).max(100),
    templateTitle: z.string().trim().min(1).max(200),
    category: z.string().trim().max(100).optional(),
    templateVersion: z.number().int().min(1).max(10_000).optional(),
    inputs: z
      .record(z.string().regex(INPUT_KEY_PATTERN), z.string().max(10_000))
      .refine(value => Object.keys(value).length <= MAX_INPUT_FIELDS, { message: "Too many inputs" })
      .optional(),
    certificateId: z.string().trim().max(200).optional(),
    // Printed on the certificate as a QR code; the public verification page is keyed by it.
    verificationCode: z.string().regex(VERIFICATION_CODE_PATTERN),
    // Hash of the PDF the browser built. Only used when encryption is on (otherwise the server builds the PDF).
    pdfSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    // With encryption on the browser builds the PDF and sends it, with the inputs, as `enc` bound to `docId`.
    docId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
    enc: largeEnvelopeSchema.optional(),
    pngDataUrl: z
      .string()
      .max(MAX_PNG_DATA_URL_CHARS)
      .refine(
        value =>
          value.startsWith(PNG_DATA_URL_PREFIX) && BASE64_PATTERN.test(value.slice(PNG_DATA_URL_PREFIX.length)),
        { message: "Expected a PNG data URL" }
      )
      .optional()
  }),
  signatures: z.record(z.enum(["witness1", "witness2", "officiant", "issuingAuthority"]), signingSessionIdSchema).optional()
});

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

export async function POST(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    if (!isValidSigningSessionId(params.sessionId)) {
      return NextResponse.json({ error: "Invalid signing session" }, { status: 400 });
    }
    const parsed = await parseJsonBody(req, finalizeSchema, { maxBytes: MAX_FINALIZE_BODY_BYTES });
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const certificatePayload = payload.certificatePayload;
    if (!isCertificateSigningConfigured()) {
      return NextResponse.json({ error: "Certificate signing isn't configured on the server (CERTIFICATE_SIGNING_KEY_BASE64)." }, { status: 503 });
    }
    const e2eeOn = (await getState()).enabled;
    if (e2eeOn) {
      if (!certificatePayload.enc || !certificatePayload.docId || !certificatePayload.pdfSha256 || certificatePayload.inputs || certificatePayload.pngDataUrl) {
        return NextResponse.json({ error: "Encryption is on: send the finalized document encrypted.", code: "E2EE_REQUIRED" }, { status: 400 });
      }
      if (!(await deviceBelongsTo(certificatePayload.enc as EnvelopeInput, actor.uid))) {
        return NextResponse.json({ error: "Unknown or inactive encryption device." }, { status: 403 });
      }
    } else if (certificatePayload.enc || !certificatePayload.pngDataUrl) {
      return NextResponse.json({ error: "Invalid certificate payload" }, { status: 400 });
    }
    const sessionIds = new Set<string>([params.sessionId]);
    if (payload.signatures) {
      Object.values(payload.signatures).forEach(id => {
        if (id) sessionIds.add(id);
      });
    }

    const sessions = await Promise.all(
      Array.from(sessionIds).map(async sessionId => {
        const sessionRef = getAdminDb().collection("signingSessions").doc(sessionId);
        const snapshot = await sessionRef.get();
        return { sessionId, sessionRef, snapshot };
      })
    );

    for (const { sessionId, snapshot } of sessions) {
      if (!snapshot.exists) {
        return NextResponse.json({ error: `Session not found (${sessionId})` }, { status: 404 });
      }
      const data = snapshot.data() ?? {};
      const expiresAt = toDate(data.expiresAt);
      if (data.status === "pending" && expiresAt && new Date() > expiresAt) {
        return NextResponse.json({ error: `Session expired (${sessionId})` }, { status: 410 });
      }
      if (data.status !== "signed" || !(data.signatureEnc || data.signatureSealed)) {
        return NextResponse.json({ error: `Session not signed (${sessionId})` }, { status: 409 });
      }
      if (data.signatureEnc) decryptSignature(data.signatureEnc, sessionId);
    }

    const checkError = checkSigningSessions({
      certificateId: certificatePayload.certificateId,
      primarySessionId: params.sessionId,
      signatures: payload.signatures,
      sessions: Object.fromEntries(sessions.map(({ sessionId, snapshot }) => [sessionId, snapshot.data() ?? {}]))
    });
    if (checkError) return NextResponse.json({ error: checkError, code: "SIGNATURE_MISMATCH" }, { status: 409 });

    const documentsCollection = getAdminDb().collection(orgDocumentsCollectionPath(COMMUNITY_SLUG));
    const common = {
      templateId: certificatePayload.templateId,
      templateTitle: certificatePayload.templateTitle,
      category: certificatePayload.category ?? "General",
      ...(certificatePayload.templateVersion ? { templateVersion: certificatePayload.templateVersion } : {}),
      certificateId: certificatePayload.certificateId ?? null,
      signed: true,
      status: "finalized",
      pdfMime: "application/pdf",
      createdByUid: actor.uid,
      createdByEmail: actor.email ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    // Everything is written in one batch: the certificate, its verification record and the used sessions.
    const db = getAdminDb();
    const batch = db.batch();
    let savedRef: FirebaseFirestore.DocumentReference;
    let pdfSha256: string;
    let pdfBase64: string | undefined;
    if (certificatePayload.enc) {
      savedRef = documentsCollection.doc(certificatePayload.docId!);
      pdfSha256 = certificatePayload.pdfSha256!;
      // create() refuses an id that already exists, so a finalized certificate can't be replaced.
      batch.create(savedRef, { ...common, enc: certificatePayload.enc });
    } else {
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.addImage(certificatePayload.pngDataUrl!, "PNG", 0, 0, pageWidth, pageHeight);
      const pdfBytes = Buffer.from(doc.output("arraybuffer"));
      pdfBase64 = pdfBytes.toString("base64");
      pdfSha256 = sha256Hex(pdfBytes);
      savedRef = documentsCollection.doc();
      batch.create(savedRef, { ...common, inputs: certificatePayload.inputs ?? {}, pdfBase64 });
    }

    const issued = {
      code: certificatePayload.verificationCode,
      certificateId: certificatePayload.certificateId!,
      templateId: certificatePayload.templateId,
      templateVersion: certificatePayload.templateVersion ?? 1,
      issuedAt: new Date().toISOString(),
      pdfSha256
    };
    const record: CertificateRecord = {
      ...issued,
      templateTitle: certificatePayload.templateTitle,
      issuedByUid: actor.uid,
      signature: signCertificate(issued),
      status: "valid"
    };
    // A verification code can be used once.
    batch.create(db.collection(CERTIFICATES_COLLECTION).doc(record.code), record);
    for (const { sessionRef } of sessions) {
      batch.update(sessionRef, {
        status: "finalized",
        finalizedAt: FieldValue.serverTimestamp(),
        signatureEnc: FieldValue.delete(),
        signatureSealed: FieldValue.delete()
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      if ((error as { code?: number }).code === 6) {
        return NextResponse.json({ error: "This certificate or verification code was already issued." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, documentId: savedRef.id, verificationCode: record.code, pdfSha256, ...(pdfBase64 ? { pdfBase64 } : {}) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    if (error instanceof AdminAccessError) {
      return NextResponse.json(
        { error: "Unauthorized", reason: error.reason ?? "ADMIN_ACCESS_DENIED" },
        { status: error.status }
      );
    }
    console.error("Failed to finalize signed certificate", error);
    return NextResponse.json({ error: "Failed to finalize signed certificate" }, { status: 500 });
  }
}
