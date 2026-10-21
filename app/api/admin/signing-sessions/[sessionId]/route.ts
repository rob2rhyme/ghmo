import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { decryptSignature, isValidSigningSessionId, toPngDataUrl } from "@/src/lib/signatureEncryption";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return undefined;
}

export async function GET(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    await requireActiveAdmin(req, COMMUNITY_SLUG);
    if (!isValidSigningSessionId(params.sessionId)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const sessionRef = getAdminDb().collection("signingSessions").doc(params.sessionId);
    const snapshot = await sessionRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const data = snapshot.data() ?? {};
    const expiresAt = toDate(data.expiresAt);
    const now = new Date();
    if (data.status === "pending" && expiresAt && now > expiresAt) {
      await sessionRef.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() });
      data.status = "expired";
    }
    const responsePayload: Record<string, unknown> = {
      sessionId: snapshot.id,
      status: data.status ?? "pending",
      role: data.role ?? null,
      certificateId: data.certificateId ?? null,
      createdAt: toDate(data.createdAt)?.toISOString(),
      expiresAt: expiresAt?.toISOString(),
      signedAt: toDate(data.signedAt)?.toISOString(),
      finalizedAt: toDate(data.finalizedAt)?.toISOString(),
      signerName: data.signerName ?? null
    };

    const includeSignature = req.nextUrl.searchParams.get("includeSignature") === "1";
    if (includeSignature && data.status === "signed" && data.signatureEnc) {
      const decrypted = decryptSignature(data.signatureEnc, params.sessionId);
      responsePayload.signatureDataUrl = toPngDataUrl(decrypted);
    }

    return NextResponse.json(responsePayload);
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
    console.error("Failed to load signing session", error);
    return NextResponse.json({ error: "Failed to load signing session" }, { status: 500 });
  }
}
