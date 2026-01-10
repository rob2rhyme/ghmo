import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
