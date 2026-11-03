import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminsCollectionPath, orgDocPath } from "@/src/lib/firestorePaths";
import { normalizeMemberEmail } from "@/src/lib/members";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { safeEqual } from "@/src/lib/security/compare";
import { getClientIp } from "@/src/lib/security/clientIp";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 32;

const bodySchema = z.object({
  secret: z.string().min(1).max(512),
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120).optional()
});

/**
 * One-time creation of the first super-admin (plan S-17).
 * After it succeeds, `organizations/ghmo/config/bootstrap` exists and this route
 * refuses every further call. The new admin then signs in with a magic link.
 */
export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json({ error: "Admin env not configured" }, { status: 503 });
  }

  const bootstrapSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
  if (!bootstrapSecret || bootstrapSecret.length < MIN_SECRET_LENGTH) {
    // Treat a missing or weak secret as "feature off".
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = getClientIp(req.headers);
  const rate = await checkRateLimit(`bootstrap:${ip}`, 5, 10 * 60 * 1000);
  if (!rate.success) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { secret, email, name } = parsed.data;
  if (!safeEqual(secret, bootstrapSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailLower = normalizeMemberEmail(email);

  try {
    const db = getAdminDb();
    const markerRef = db.doc(`${orgDocPath(COMMUNITY_SLUG)}/config/bootstrap`);
    const adminRef = db.collection(orgAdminsCollectionPath(COMMUNITY_SLUG)).doc();

    const created = await db.runTransaction(async tx => {
      const marker = await tx.get(markerRef);
      if (marker.exists) return false;
      const now = new Date();
      tx.set(adminRef, {
        name: name ?? "Bootstrap Admin",
        email,
        emailLower,
        roles: ["super_admin"],
        status: "active",
        createdAt: now,
        createdBy: "bootstrap"
      });
      tx.set(markerRef, { completedAt: now, adminId: adminRef.id });
      return true;
    });

    if (!created) {
      return NextResponse.json({ error: "Bootstrap already completed" }, { status: 409 });
    }

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "admin_bootstrap",
      actor: { uid: "bootstrap", role: "system" },
      resource: { type: "admin", id: adminRef.id, summary: "Created first super-admin" },
      meta: { route: "/api/admin/bootstrap" }
    });

    return NextResponse.json({ ok: true, adminId: adminRef.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json({ error: "Admin env not configured" }, { status: 503 });
    }
    throw error;
  }
}
