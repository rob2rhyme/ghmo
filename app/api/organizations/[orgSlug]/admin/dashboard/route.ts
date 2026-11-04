import { NextRequest, NextResponse } from "next/server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { loadAdminDashboard } from "@/src/lib/adminData.server";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const orgSlug = params.orgSlug;

    const guard = await enforceActiveAdmin(req, orgSlug);
    if ("response" in guard) return guard.response;

    return NextResponse.json(await loadAdminDashboard(guard));
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    throw error;
  }
}
