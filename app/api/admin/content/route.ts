import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { getHomeBlocks, upsertHomeBlocks } from "@/src/lib/community";
import { logAudit } from "@/src/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocks = await getHomeBlocks();
  return NextResponse.json({ blocks });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContextFromRequest(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { blocks } = await req.json();
  await upsertHomeBlocks(blocks || []);
  await logAudit({
    communityId: auth.communityId,
    type: "home_blocks_updated",
    summary: "Updated home content blocks",
    actorUid: auth.uid,
    role: auth.role,
    metadata: { blockCount: Array.isArray(blocks) ? blocks.length : 0 }
  });
  return NextResponse.json({ ok: true });
}
