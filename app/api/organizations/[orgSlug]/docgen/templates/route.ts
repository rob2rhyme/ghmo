import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDocgenCollectionPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cookieHeader = req.headers.get("cookie");
  const ctx = await getAuthContextFromRequest(req);
  if (process.env.NODE_ENV === "development") {
    console.debug("Docgen templates auth attempt", {
      cookiePresent: Boolean(cookieHeader),
      orgSlug: params.orgSlug,
      ctx
    });
  }

  if (!ctx) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Docgen templates missing auth context", { orgSlug: params.orgSlug });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requireActiveAdmin(ctx, params.orgSlug);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Docgen templates admin guard failed", {
          status: error.status,
          reason: error.reason,
          ctx,
          orgSlug: params.orgSlug
        });
      }
      const status = error.status === 401 || error.status === 403 ? error.status : 401;
      return NextResponse.json(
        { error: "Unauthorized", reason: error.reason ?? "ADMIN_ACCESS_DENIED", uid: ctx.uid },
        { status }
      );
    }
    throw error;
  }

  try {
    const docgenCollection = adminDb.collection(orgDocgenCollectionPath(params.orgSlug));
    const snapshot = await docgenCollection.limit(20).get();
    const templates =
      snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

    return NextResponse.json({ templates: toPlainJson(templates) });
  } catch (error) {
    console.error("Failed to load docgen templates", error);
    return NextResponse.json(
      { error: "Failed to load templates", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
