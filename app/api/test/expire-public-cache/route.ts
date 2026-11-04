import { NextResponse } from "next/server";
import { expirePublicCache, PUBLIC_CACHE_TAGS } from "@/src/lib/publicCache.server";

export const dynamic = "force-dynamic";

/**
 * Test hook: the browser suites write to the Firestore emulator directly, so after resetting it they expire
 * the public cache here. It exists only in emulator builds (NEXT_PUBLIC_USE_FIREBASE_EMULATORS is fixed at
 * build time); in every real build it answers 404.
 */
export async function GET() {
  // Never on Vercel, whatever the flag says: the flag set there by mistake must not open this route.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true" || process.env.VERCEL) return new NextResponse(null, { status: 404 });
  expirePublicCache(...Object.values(PUBLIC_CACHE_TAGS));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
