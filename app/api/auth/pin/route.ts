import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/src/lib/audit";
import { verifyPin, issueCustomToken, logAuthAttempt, loadPinByRole, Role } from "@/src/lib/auth";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
  const userAgent = req.headers.get("user-agent");
  const body = await req.json();
  const { pin, requestedRole } = body as { pin: string; requestedRole: Role };

  if (!pin || !requestedRole) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const rateKey = `${COMMUNITY_ID}-${requestedRole}-${ip}`;
  const rate = checkRateLimit(rateKey, 5, 5 * 60 * 1000);
  if (!rate.success) {
    return NextResponse.json({ error: "Too many attempts", retryInMs: rate.retryInMs }, { status: 429 });
  }

  type PinDoc = {
    id: string;
    pinHash?: string;
    failedAttempts?: number;
    lockedUntil?: { toMillis?: () => number } | Date | null;
  };

  const pinDoc = (await loadPinByRole(requestedRole)) as PinDoc | null;
  if (!pinDoc) {
    await logAuthAttempt({ communityId: COMMUNITY_ID, role: requestedRole, success: false, ip, userAgent });
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const lockedUntilMs =
    pinDoc.lockedUntil instanceof Date
      ? pinDoc.lockedUntil.getTime()
      : typeof pinDoc.lockedUntil?.toMillis === "function"
        ? pinDoc.lockedUntil.toMillis()
        : null;

  if (lockedUntilMs && lockedUntilMs > Date.now()) {
    return NextResponse.json({ error: "PIN locked" }, { status: 423 });
  }

  if (!pinDoc.pinHash) {
    await logAuthAttempt({ communityId: COMMUNITY_ID, role: requestedRole, success: false, pinId: pinDoc.id, ip, userAgent });
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const ok = await verifyPin(pin, pinDoc.pinHash);
  if (!ok) {
    const failedAttempts = (pinDoc.failedAttempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await adminDb.doc(`community/${COMMUNITY_ID}/pins/${pinDoc.id}`).set(
      {
        failedAttempts,
        lockedUntil
      },
      { merge: true }
    );
    await logAuthAttempt({ communityId: COMMUNITY_ID, role: requestedRole, success: false, pinId: pinDoc.id, ip, userAgent });
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  await adminDb.doc(`community/${COMMUNITY_ID}/pins/${pinDoc.id}`).set(
    {
      failedAttempts: 0,
      lockedUntil: null,
      lastUsedAt: new Date()
    },
    { merge: true }
  );

  const uid = `${COMMUNITY_ID}-${requestedRole}-${pinDoc.id}`;
  const customToken = await issueCustomToken(uid, requestedRole);

  await logAuthAttempt({ communityId: COMMUNITY_ID, role: requestedRole, success: true, pinId: pinDoc.id, ip, userAgent });
  await logAudit({ communityId: COMMUNITY_ID, type: "pin_login", role: requestedRole, actorUid: uid, ip, userAgent });

  return NextResponse.json({ customToken, communityId: COMMUNITY_ID, role: requestedRole });
}
