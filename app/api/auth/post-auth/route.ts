import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID } from "@/src/lib/community";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const emailLower = decoded.email?.toLowerCase();
    if (!emailLower) return NextResponse.json({ ok: false });

    const memberSnapshot = await adminDb
      .collection(`community/${COMMUNITY_ID}/members`)
      .where("emailLower", "==", emailLower)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (memberSnapshot.empty) return NextResponse.json({ ok: false });

    const memberDoc = memberSnapshot.docs[0];
    const data = memberDoc.data() as Record<string, any>;
    if (data.uid && data.uid !== decoded.uid) return NextResponse.json({ ok: false });

    await memberDoc.ref.set(
      {
        uid: data.uid || decoded.uid,
        email: data.email || decoded.email,
        emailLower: data.emailLower || emailLower,
        updatedAt: new Date()
        // TODO: attach inviteCode metadata once invite codes are added.
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false });
  }
}
