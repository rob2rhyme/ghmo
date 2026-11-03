import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    // Passkey session required (default). The claim lets Firestore rules check it too.
    const { actor, authMethod } = await requireActiveAdmin(req, "ghmo");
    const adminAuth = getAdminAuth();
    const token = await adminAuth.createCustomToken(actor.uid, {
      orgSlug: "ghmo",
      role: "admin",
      admin: true,
      authMethod
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
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
