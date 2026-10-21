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
    inputs: z
      .record(z.string().regex(INPUT_KEY_PATTERN), z.string().max(10_000))
      .refine(value => Object.keys(value).length <= MAX_INPUT_FIELDS, { message: "Too many inputs" })
      .optional(),
    certificateId: z.string().trim().max(200).optional(),
    pngDataUrl: z
      .string()
      .max(MAX_PNG_DATA_URL_CHARS)
      .refine(
        value =>
          value.startsWith(PNG_DATA_URL_PREFIX) && BASE64_PATTERN.test(value.slice(PNG_DATA_URL_PREFIX.length)),
        { message: "Expected a PNG data URL" }
      )
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
      if (data.status !== "signed" || !data.signatureEnc) {
        return NextResponse.json({ error: `Session not signed (${sessionId})` }, { status: 409 });
      }
      decryptSignature(data.signatureEnc, sessionId);
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.addImage(certificatePayload.pngDataUrl, "PNG", 0, 0, pageWidth, pageHeight);
    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    const documentsCollection = getAdminDb().collection(orgDocumentsCollectionPath(COMMUNITY_SLUG));
    const savedRef = await documentsCollection.add({
      templateId: certificatePayload.templateId,
      templateTitle: certificatePayload.templateTitle,
      category: certificatePayload.category ?? "General",
      inputs: certificatePayload.inputs ?? {},
      certificateId: certificatePayload.certificateId ?? null,
      signed: true,
      pdfBase64,
      pdfMime: "application/pdf",
      createdByUid: actor.uid,
      createdByEmail: actor.email ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await Promise.all(
      sessions.map(({ sessionRef }) =>
        sessionRef.update({
          status: "finalized",
          finalizedAt: FieldValue.serverTimestamp(),
          signatureEnc: FieldValue.delete()
        })
      )
    );

    return NextResponse.json({ ok: true, documentId: savedRef.id });
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
