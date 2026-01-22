import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const { actor } = await requireActiveAdmin(req, "ghmo");
    const adminAuth = getAdminAuth();
    const token = await adminAuth.createCustomToken(actor.uid, {
      orgSlug: "ghmo",
      role: "admin",
      admin: true
    });

    return NextResponse.json(
      { token },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
