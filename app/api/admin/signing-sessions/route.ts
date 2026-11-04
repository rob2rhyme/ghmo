import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";
import { getAppOrigin } from "@/src/lib/appUrl";

export const dynamic = "force-dynamic";

const signingSessionSchema = z.object({
  role: z.enum(["witness1", "witness2", "officiant", "issuingAuthority"]),
  // The certificate's number ("GHMO-2026-001"): every signature is collected for a numbered certificate, and
  // finalizing checks that each signature was collected for the number being issued.
  certificateId: z.string().trim().min(1).max(200),
  /** What is being signed ("Wedding certificate"), shown to the signer. Plain text, no personal details. */
  documentTitle: z.string().trim().max(80).optional(),
  expiresInMinutes: z.number().int().min(1).max(60).optional()
});

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Signing can't be set up right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, signingSessionSchema);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const expiresInMinutes = payload.expiresInMinutes ?? 10;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + expiresInMinutes * 60 * 1000);
    const sessionId = crypto.randomBytes(32).toString("hex");
    await getAdminDb()
      .collection("signingSessions")
      .doc(sessionId)
      .set({
        status: "pending",
        role: payload.role,
        certificateId: payload.certificateId,
        documentTitle: payload.documentTitle || null,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        createdByUid: actor.uid,
        createdByEmail: actor.email ?? null
      });
    // The configured site address, never a Host header (getAppOrigin refuses to guess in production).
    const baseUrl = getAppOrigin(req);
    const signUrl = `${baseUrl}/sign/${sessionId}`;
    return NextResponse.json({
      sessionId,
      signUrl,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Signing can't be set up right now. Try again in a few minutes." },
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
