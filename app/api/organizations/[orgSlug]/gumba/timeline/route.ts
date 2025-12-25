import { NextRequest, NextResponse } from "next/server";
import { assertMember, assertCommunityRole } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await assertMember(req);
  const admin = member ? null : await assertCommunityRole("admin");
  if (!member && !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb
    .collection(orgTimelineCollectionPath(params.orgSlug))
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();

  const fallbackSnap =
    snap.empty
      ? await adminDb
          .collection(`community/${COMMUNITY_ID}/timeline`)
          .orderBy("timestamp", "desc")
          .limit(50)
          .get()
      : null;

  const sourceDocs = snap.empty && fallbackSnap ? fallbackSnap.docs : snap.docs;

  const timeline = sourceDocs.map(doc => {
    const data = doc.data() as Record<string, any>;
    const ts = data.timestamp;
    const timestamp =
      typeof ts?.toMillis === "function"
        ? ts.toMillis()
        : ts instanceof Date
          ? ts.getTime()
          : typeof ts === "number"
            ? ts
            : null;
    return { id: doc.id, ...data, timestamp };
  });

  return NextResponse.json(toPlainJson({ ok: true, timeline }));
}
