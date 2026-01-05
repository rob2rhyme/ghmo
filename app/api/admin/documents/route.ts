import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { createDocument } from "@/src/features/docgen/firestore/docRepo";

export const dynamic = "force-dynamic";

type DocumentPayload = {
  templateId?: string;
  templateTitle?: string;
  category?: string;
  inputs?: Record<string, string>;
  docId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const payload = (await req.json().catch(() => ({}))) as DocumentPayload;
    if (!payload.templateId || !payload.templateTitle) {
      return NextResponse.json({ error: "Missing template metadata" }, { status: 400 });
    }
    const inputs = payload.inputs && typeof payload.inputs === "object" ? payload.inputs : {};
    const saved = await createDocument({
      templateId: payload.templateId,
      templateTitle: payload.templateTitle,
      category: payload.category ?? "General",
      inputs,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      docId: payload.docId
    });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json(
        { error: "Unauthorized", reason: error.reason ?? "ADMIN_ACCESS_DENIED" },
        { status: error.status }
      );
    }
    console.error("Document save failed", error);
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
