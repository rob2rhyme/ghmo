import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { hashPin } from "@/src/lib/auth";
import { logAudit } from "@/src/lib/audit";
import { normalizeMemberEmail } from "@/src/lib/members";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

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
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
    const bootstrapSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
    const db = getAdminDb();

    if (!bootstrapSecret) {
      return NextResponse.json({ error: "BOOTSTRAP_ADMIN_SECRET not configured" }, { status: 500 });
    }

    const rateKey = `${COMMUNITY_ID}-bootstrap-${ip}`;
    const rate = checkRateLimit(rateKey, 5, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many attempts", retryInMs: rate.retryInMs }, { status: 429 });
    }

    let body: { secret?: string; pin?: string; label?: string; email?: string; name?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { secret, pin, label } = body;

    if (!secret || !pin) {
      return NextResponse.json({ error: "Missing secret or pin" }, { status: 400 });
    }

    if (secret !== bootstrapSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bootstrapConfigRef = db.doc(`organizations/${COMMUNITY_SLUG}/config/bootstrap`);
    const bootstrapConfigSnap = await bootstrapConfigRef.get();
    if (bootstrapConfigSnap.exists) {
      return NextResponse.json({ error: "Bootstrap already completed" }, { status: 409 });
    }

    const activeAdminPins = await db
      .collection(`organizations/${COMMUNITY_SLUG}/pins`)
      .where("role", "==", "admin")
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!activeAdminPins.empty) {
      return NextResponse.json({ error: "Bootstrap already completed" }, { status: 409 });
    }

    const pinHash = await hashPin(pin);

    const pinDoc = await db.collection(`organizations/${COMMUNITY_SLUG}/pins`).add({
      role: "admin",
      label: label || "Bootstrap Admin PIN",
      pinHash,
      status: "active",
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      createdBy: "bootstrap"
    });
    const emailLower = normalizeMemberEmail(body.email);
    if (!emailLower) {
      return NextResponse.json({ error: "Email is required for admin bootstrap" }, { status: 400 });
    }
    await db.doc(orgAdminDocPath(COMMUNITY_SLUG, pinDoc.id)).set({
      name: body.name || label || "Bootstrap Admin",
      email: body.email,
      emailLower,
      roles: ["super_admin"],
      status: "active",
      createdAt: new Date(),
      createdBy: "bootstrap",
      pinId: pinDoc.id
    });

    await bootstrapConfigRef.set({ completedAt: new Date() });

    await logAudit({
      communityId: COMMUNITY_ID,
      type: "admin_action",
      metadata: { action: "bootstrap_create_pin", pinId: pinDoc.id, email: body.email },
      actorUid: "bootstrap",
      role: "admin"
    });

    return NextResponse.json({ ok: true, id: pinDoc.id }, { status: 201 });
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
