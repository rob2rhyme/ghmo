import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "@/src/lib/appUrl";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `email` stays optional/loosely typed: a blank or malformed address gets the same
// generic answer as an unknown one, so validation cannot be used for enumeration.
const bodySchema = z.object({ email: z.string().max(320).optional() });
const emailFormat = z.string().email().max(320);

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    const ip = getClientIp(req.headers);
    const rateKey = `send-login-link:${COMMUNITY_ID}:${ip}`;
    const rate = await checkRateLimit(rateKey, 5, 10 * 60 * 1000);
    if (!rate.success) {
      return NextResponse.json({ ok: true, message: genericMessage() });
    }

    const db = getAdminDb();

    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const emailRaw = parsed.data.email?.trim() || "";
    const emailLower = emailRaw.toLowerCase();
    if (!emailLower || !emailFormat.safeParse(emailRaw).success) {
      return NextResponse.json({ ok: true, message: genericMessage() });
    }

    const memberSnapshot = await db
      .collection(orgMembersCollectionPath(COMMUNITY_SLUG))
      .where("emailLower", "==", emailLower)
      .where("status", "==", "active")
      .limit(1)
      .get();
    const fallbackSnapshot =
      memberSnapshot.empty
        ? await db
            .collection(`community/${COMMUNITY_ID}/members`)
            .where("emailLower", "==", emailLower)
            .where("status", "==", "active")
            .limit(1)
            .get()
        : null;
    const effectiveSnapshot = memberSnapshot.empty && fallbackSnapshot ? fallbackSnapshot : memberSnapshot;
    if (effectiveSnapshot.empty) {
      return NextResponse.json({ ok: true, message: genericMessage() });
    }

    const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const continueUrl = `${getAppOrigin(req)}/login`;
    if (!firebaseApiKey) {
      console.warn("Missing NEXT_PUBLIC_FIREBASE_API_KEY; cannot send magic link");
      return NextResponse.json({ ok: true, message: genericMessage() });
    }

    try {
      const sendLinkUrl = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseApiKey}`;
      const payload = {
        requestType: "EMAIL_SIGNIN",
        email: emailRaw,
        continueUrl,
        canHandleCodeInApp: true
      };
      await fetch(sendLinkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Failed to send magic link", err instanceof Error ? err.message : "unknown error");
    }

    return NextResponse.json({ ok: true, message: genericMessage() });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}

function genericMessage() {
  return "If your access is enabled, you'll receive a sign-in email.";
}
