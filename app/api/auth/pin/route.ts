import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { logAuditEvent } from "@/src/lib/audit";
import { verifyPin, issueCustomToken, logAuthAttempt, loadPinByRole, Role } from "@/src/lib/auth";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminProfile } from "@/src/lib/admin";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { AdminEnvError, getAdminEnvStatus, getServerEnv } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { FEATURE_PIN_LOGIN } = getServerEnv();
    if (!FEATURE_PIN_LOGIN) {
      return NextResponse.json({ error: "PIN login disabled" }, { status: 404 });
    }
    const ip = req.headers.get("x-forwarded-for") || "unknown";
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

    const db = getAdminDb();

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
      await logAuthAttempt({
        communityId: COMMUNITY_ID,
        role: requestedRole,
        success: false,
        pinId: pinDoc.id,
        ip,
        userAgent
      });
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const ok = await verifyPin(pin, pinDoc.pinHash);
    if (!ok) {
      const failedAttempts = (pinDoc.failedAttempts || 0) + 1;
      const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.doc(`organizations/${COMMUNITY_SLUG}/pins/${pinDoc.id}`).set(
        {
          failedAttempts,
          lockedUntil
        },
        { merge: true }
      );
      await logAuthAttempt({
        communityId: COMMUNITY_ID,
        role: requestedRole,
        success: false,
        pinId: pinDoc.id,
        ip,
        userAgent
      });
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    await db.doc(`organizations/${COMMUNITY_SLUG}/pins/${pinDoc.id}`).set(
      {
        failedAttempts: 0,
        lockedUntil: null,
        lastUsedAt: new Date()
      },
      { merge: true }
    );

    const adminProfile = await getAdminProfile(COMMUNITY_SLUG, pinDoc.id);
    if (!adminProfile || adminProfile.status !== "active") {
      return NextResponse.json({ error: "Admin not authorized" }, { status: 403 });
    }

    await db.doc(orgAdminDocPath(COMMUNITY_SLUG, pinDoc.id)).set(
      {
        lastLoginAt: Timestamp.now()
      },
      { merge: true }
    );

    const uid = pinDoc.id;
    const customToken = await issueCustomToken(uid, requestedRole, { pinId: pinDoc.id });

    await logAuthAttempt({ communityId: COMMUNITY_ID, role: requestedRole, success: true, pinId: pinDoc.id, ip, userAgent });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "login",
      actor: { uid, adminId: pinDoc.id, name: adminProfile.name, email: adminProfile.email, role: requestedRole },
      resource: { type: "admin_session", summary: "PIN login" },
      meta: { ip, userAgent, route: "/api/auth/pin" }
    });

    return NextResponse.json({ customToken, communityId: COMMUNITY_ID, role: requestedRole });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
