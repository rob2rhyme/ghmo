import { NextRequest, NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContextFromRequest(req);
  if (!ctx) return NextResponse.json({ authenticated: false, role: null, uid: null, orgSlug: null });

  return NextResponse.json({
    authenticated: true,
    role: ctx.role,
    uid: ctx.uid,
    orgSlug: COMMUNITY_SLUG
  });
}
