import { NextRequest, NextResponse } from "next/server";
import { assertMember, assertCommunityRole } from "@/src/lib/auth";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const member = await assertMember(req);
    const admin = member ? null : await assertCommunityRole("admin");
    if (!member && !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snap = await getAdminDb()
      .collection(orgTimelineCollectionPath(params.orgSlug))
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    const sourceDocs = snap.docs;

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
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured", missing: error.issues },
        { status: 503 }
      );
    }
    throw error;
  }
}
