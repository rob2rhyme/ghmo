import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

type SigningSessionPayload = {
  role?: "witness1" | "witness2" | "officiant" | "issuingAuthority";
  certificateId?: string;
  expiresInMinutes?: number;
};

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const payload = (await req.json().catch(() => ({}))) as SigningSessionPayload;
    if (!payload.role) {
      return NextResponse.json({ error: "Missing role" }, { status: 400 });
    }
    const expiresInMinutes = Math.max(1, Math.min(60, payload.expiresInMinutes ?? 10));
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + expiresInMinutes * 60 * 1000);
    const sessionId = crypto.randomBytes(32).toString("hex");
    await getAdminDb()
      .collection("signingSessions")
      .doc(sessionId)
      .set({
        status: "pending",
        role: payload.role,
        certificateId: payload.certificateId ?? null,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        createdByUid: actor.uid,
        createdByEmail: actor.email ?? null
      });
    const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || "";
    let baseUrl = envBaseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
      baseUrl = `${proto}://${host}`;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "NEXT_PUBLIC_APP_URL is not set. Signing links may not work on mobile during local dev."
        );
      }
    }
    const signUrl = `${baseUrl}/sign/${sessionId}`;
    return NextResponse.json({
      sessionId,
      signUrl,
      expiresAt: expiresAt.toISOString()
    });
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
    console.error("Failed to create signing session", error);
    return NextResponse.json({ error: "Failed to create signing session" }, { status: 500 });
  }
}
