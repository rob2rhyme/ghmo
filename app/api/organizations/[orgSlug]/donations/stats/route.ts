import { NextResponse } from "next/server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { readDonationStats } from "@/src/lib/publicData.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

/** Public, read-only: the CDN may serve it for 5 minutes (next.config.mjs leaves this path out of no-store). */
const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(_: Request, context: { params: Promise<{ orgSlug: string }> }) {
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

    const stats = await readDonationStats();

    return NextResponse.json({ ok: true, stats }, { headers: { "Cache-Control": PUBLIC_API_CACHE_CONTROL } });
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
