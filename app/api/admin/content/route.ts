import { NextRequest, NextResponse } from "next/server";
import { getHomeBlocks, upsertHomeBlocks } from "@/src/lib/community";
import { logAuditEvent } from "@/src/lib/audit";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export async function GET(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const blocks = await getHomeBlocks();
  return NextResponse.json({ blocks });
}

export async function POST(req: NextRequest) {
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
}
