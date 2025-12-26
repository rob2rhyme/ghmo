import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, AdminProfile, AdminActor, requireActiveAdmin } from "./admin";

export type AdminGuardResult =
  | {
      actor: AdminActor;
      admin: AdminProfile;
    }
  | {
      response: NextResponse;
    };

export async function enforceActiveAdmin(
  req: NextRequest,
  orgSlug: string
): Promise<AdminGuardResult> {
  try {
    const { actor, admin } = await requireActiveAdmin(req, orgSlug);
    return { actor, admin };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { response: NextResponse.json({ error: error.message }, { status: error.status }) };
    }
    throw error;
  }
}
