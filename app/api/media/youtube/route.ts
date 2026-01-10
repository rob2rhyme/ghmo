import { NextResponse } from "next/server";
import { loadYouTubeMedia } from "@/src/lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await loadYouTubeMedia();
  return NextResponse.json(feed);
}
