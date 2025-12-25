import { NextRequest, NextResponse } from "next/server";
import { assertMember, assertCommunityRole } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { communityDocPath, orgDocPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await assertMember(req);
  const admin = member ? null : await assertCommunityRole("admin");
  if (!member && !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const docgenCollection = adminDb.doc(orgDocPath(params.orgSlug)).collection("docgen");
    const snapshot = await docgenCollection.limit(20).get();
    const templates =
      !snapshot.empty
        ? snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
        : (
            await adminDb
              .doc(communityDocPath(COMMUNITY_ID))
              .collection("docgen")
              .limit(20)
              .get()
          ).docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

    return NextResponse.json(toPlainJson({ templates }));
  } catch (error) {
    console.error("Failed to load docgen templates", error);
    return NextResponse.json(
      { error: "Failed to load templates", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
