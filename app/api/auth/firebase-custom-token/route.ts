import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { getAdminAuth } from "@/src/lib/firebaseAdmin";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    // Strong session required (default). The claims let Firestore rules check it too: `authMethod` for the
    // sign-in strength, `sessionExp` so the browser's database access ends when this session does (a
    // Firebase sign-in in the browser could otherwise keep minting tokens after the cookie expires).
    const { actor, authMethod, sessionExpiresAt } = await requireActiveAdmin(req, "ghmo");
    if (!sessionExpiresAt) throw new AdminAccessError(401, "Unauthorized", "NO_SESSION_EXPIRY");
    const adminAuth = getAdminAuth();
    const token = await adminAuth.createCustomToken(actor.uid, {
      orgSlug: "ghmo",
      role: "admin",
      admin: true,
      authMethod,
      sessionExp: sessionExpiresAt
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
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
