import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgDocumentsCollectionPath } from "@/src/lib/firestorePaths";
import { FieldValue } from "firebase-admin/firestore";
import { decryptSignature, isValidSigningSessionId } from "@/src/lib/signatureEncryption";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

type FinalizePayload = {
  certificatePayload?: {
    templateId?: string;
    templateTitle?: string;
    category?: string;
    inputs?: Record<string, string>;
    certificateId?: string;
    pngDataUrl?: string;
  };
  signatures?: Record<string, string>;
};

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
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
    const payload = (await req.json().catch(() => ({}))) as FinalizePayload;
    const certificatePayload = payload.certificatePayload;
    if (!certificatePayload?.templateId || !certificatePayload?.templateTitle) {
      return NextResponse.json({ error: "Missing certificate payload" }, { status: 400 });
    }
    if (!certificatePayload.pngDataUrl) {
      return NextResponse.json({ error: "Missing certificate image" }, { status: 400 });
    }
    const sessionIds = new Set<string>([params.sessionId]);
    if (payload.signatures) {
      Object.values(payload.signatures).forEach(id => sessionIds.add(id));
    }
    if (![...sessionIds].every(id => typeof id === "string" && isValidSigningSessionId(id))) {
      return NextResponse.json({ error: "Invalid signing session" }, { status: 400 });
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
