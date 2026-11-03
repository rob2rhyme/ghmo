import { NextResponse } from "next/server";
import { loadYouTubeMedia } from "@/src/lib/media";

export const dynamic = "force-dynamic";

/** Public, read-only: the CDN may serve it for 5 minutes (next.config.mjs leaves this path out of no-store). */
const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET() {
  const feed = await loadYouTubeMedia();
  return NextResponse.json(feed, { headers: { "Cache-Control": PUBLIC_API_CACHE_CONTROL } });
}
