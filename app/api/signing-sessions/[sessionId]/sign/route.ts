import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { encryptSignature, parsePngDataUrl } from "@/src/lib/signatureEncryption";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

type SignPayload = {
  dataUrl?: string;
  signerName?: string;
};

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return undefined;
}

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as SignPayload;
    if (!payload.dataUrl) {
      return NextResponse.json({ error: "Missing signature data" }, { status: 400 });
    }
    const sessionRef = getAdminDb().collection("signingSessions").doc(params.sessionId);
    const snapshot = await sessionRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const data = snapshot.data() ?? {};
    const expiresAt = toDate(data.expiresAt);
    if (data.status !== "pending") {
      return NextResponse.json({ error: "Session not pending" }, { status: 409 });
    }
    if (expiresAt && new Date() > expiresAt) {
      await sessionRef.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ error: "Session expired" }, { status: 410 });
    }
    const bytes = parsePngDataUrl(payload.dataUrl);
    const signatureEnc = encryptSignature(bytes);
    await sessionRef.update({
      status: "signed",
      signedAt: FieldValue.serverTimestamp(),
      signerName: payload.signerName ?? null,
      signatureEnc,
      updatedAt: FieldValue.serverTimestamp()
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    console.error("Failed to sign session", error);
    return NextResponse.json({ error: "Failed to submit signature" }, { status: 500 });
  }
}
