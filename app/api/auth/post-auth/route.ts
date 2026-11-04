import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { findActiveMember, verifyIdToken } from "@/src/lib/auth";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { normalizeMemberName } from "@/src/lib/members";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false });

  try {
    let decoded;
    try {
      // Revoked tokens are refused too.
      decoded = await verifyIdToken(token);
    } catch {
      return NextResponse.json({ ok: false });
    }
    // The same rule as the session route: a verified email from the email link (or a token we minted), for an
    // active member whose record is unclaimed or already this account's. Only then is the record linked.
    const member = await findActiveMember(decoded);
    if (!member) return NextResponse.json({ ok: false });

    const memberRef = getAdminDb().doc(`${orgMembersCollectionPath(COMMUNITY_SLUG)}/${member.memberId}`);
    const data = ((await memberRef.get()).data() ?? {}) as Record<string, unknown>;
    await memberRef.set(
      {
        uid: (data.uid as string | undefined) || decoded.uid,
        email: (data.email as string | undefined) || decoded.email,
        emailLower: (data.emailLower as string | undefined) || member.emailLower,
        name: (data.name as string | undefined) || normalizeMemberName(decoded.name),
        updatedAt: new Date()
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminEnvError) {
      return NextResponse.json({ error: "This can't be loaded right now. Try again in a few minutes." }, { status: 503 });
    }
    return NextResponse.json({ ok: false });
  }
}
