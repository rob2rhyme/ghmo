import { NextRequest, NextResponse } from "next/server";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { allocateCertificateNumber } from "@/src/lib/certificateNumber.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { checkRateLimit } from "@/src/lib/rateLimit";

export const dynamic = "force-dynamic";

const UNAVAILABLE = "A certificate number can't be assigned right now. Try again in a few minutes.";

/**
 * Hands out the next certificate number ("GHMO-2026-001"). The document generator calls this before the first
 * signature is requested, so every signature and the issued certificate carry the same number.
 */
export async function POST(req: NextRequest) {
  if (!getAdminEnvStatus().ok) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    // Each call uses up a number, so a stuck button or a script can't burn through the year's numbers.
    const limited = await checkRateLimit(`certificate-number:${guard.actor.uid}`, 30, 60 * 60 * 1000);
    if (!limited.success) {
      return NextResponse.json({ error: "Too many certificate numbers were requested. Wait a few minutes and try again." }, { status: 429 });
    }
    const certificateNumber = await allocateCertificateNumber(getAdminDb(), COMMUNITY_SLUG, guard.actor.uid);
    return NextResponse.json({ certificateNumber });
  } catch (error) {
    if (error instanceof AdminEnvError) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    console.error("Failed to assign a certificate number", error);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 500 });
  }
}
