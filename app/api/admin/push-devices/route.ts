import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/src/lib/admin";
import { envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listAllDevices } from "@/src/lib/push.server";

export const dynamic = "force-dynamic";

/**
 * Every admin's push devices, for a super admin (plan §21, D47): the admin's name and whether their account is on, the
 * device name, the alerts that are on, and when it was added and last used. Never an address or keys.
 */
export async function GET(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    await requireSuperAdmin(req, COMMUNITY_SLUG);
    return NextResponse.json({ devices: await listAllDevices() });
  } catch (error) {
    return routeError(error);
  }
}
