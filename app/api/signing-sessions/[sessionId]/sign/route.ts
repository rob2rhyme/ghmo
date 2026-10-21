import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import {
  encryptSignature,
  isValidSigningSessionId,
  MAX_SIGNATURE_BYTES,
  parsePngDataUrl
} from "@/src/lib/signatureEncryption";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

// base64 is 4/3 the size of the bytes, plus the data URL prefix.
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 64;

const bodySchema = z.object({
  dataUrl: z.string().min(1).max(MAX_DATA_URL_LENGTH),
  signerName: z.string().trim().max(120).optional().nullable()
});

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
}

/**
 * Public endpoint behind the secret signing link. Hardened per plan S-10:
 * strict ID format, rate limits, size and PNG checks, and a transaction so a
 * link can be used exactly once.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  if (!isValidSigningSessionId(sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json({ error: "Signing is temporarily unavailable" }, { status: 503 });
  }

  const ipLimit = await checkRateLimit(`sign:ip:${getClientIp(req.headers)}`, 20, 10 * 60 * 1000);
  const sessionLimit = await checkRateLimit(`sign:session:${sessionId}`, 5, 10 * 60 * 1000);
  if (!ipLimit.success || !sessionLimit.success) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid signature data" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = parsePngDataUrl(parsed.data.dataUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid signature" }, { status: 400 });
  }

  try {
    const signatureEnc = encryptSignature(bytes, sessionId);
    const db = getAdminDb();
    const sessionRef = db.collection("signingSessions").doc(sessionId);

    // Return outcomes instead of throwing: a throw would roll back the "expired" write.
    const outcome = await db.runTransaction(async tx => {
      const snapshot = await tx.get(sessionRef);
      if (!snapshot.exists) return { status: 404, error: "Session not found" } as const;
      const data = snapshot.data() ?? {};
      if (data.status !== "pending") return { status: 409, error: "Session not pending" } as const;
      const expiresAt = toDate(data.expiresAt);
      if (expiresAt && new Date() > expiresAt) {
        tx.update(sessionRef, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
        return { status: 410, error: "Session expired" } as const;
      }
      tx.update(sessionRef, {
        status: "signed",
        signedAt: FieldValue.serverTimestamp(),
        signerName: parsed.data.signerName || null,
        signatureEnc,
        updatedAt: FieldValue.serverTimestamp()
      });
      return { status: 200 } as const;
    });

    if (outcome.status !== 200) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json({ error: "Signing is temporarily unavailable" }, { status: 503 });
    }
    console.error("Failed to sign session", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Failed to submit signature" }, { status: 500 });
  }
}
