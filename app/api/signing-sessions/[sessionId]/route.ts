import { NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return undefined;
}

export async function GET(_: Request, { params }: { params: { sessionId: string } }) {
  try {
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
    return NextResponse.json({
      sessionId: snapshot.id,
      status: data.status ?? "pending",
      role: data.role ?? null,
      expiresAt: expiresAt?.toISOString()
    });
  } catch (error) {
    console.error("Failed to load public signing session", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
