import { NextRequest, NextResponse } from "next/server";
import { assertMember } from "@/src/lib/auth";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Members may read; otherwise the caller must be an active admin with a strong session
    // (a token claim alone would still work for a disabled or magic-link-only admin).
    const member = await assertMember(req);
    if (!member) {
      const guard = await enforceActiveAdmin(req, params.orgSlug);
      if ("response" in guard) return guard.response;
    }

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
        { error: "This can't be loaded right now. Try again in a few minutes." },
        { status: 503 }
      );
    }
    throw error;
  }
}
