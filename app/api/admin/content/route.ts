import { NextRequest, NextResponse } from "next/server";
import { getHomeBlocks, upsertHomeBlocks } from "@/src/lib/adminCommunity";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { COMMUNITY_SLUG } from "@/src/lib/community";
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
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const blocks = await getHomeBlocks();
    return NextResponse.json({ blocks });
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

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;
    const { blocks } = await req.json();
    await upsertHomeBlocks(blocks || []);
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "home_blocks_updated",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "home_blocks", summary: "Updated home content blocks" },
      meta: { blockCount: Array.isArray(blocks) ? blocks.length : 0, route: "/api/admin/content" }
    });
    return NextResponse.json({ ok: true });
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
