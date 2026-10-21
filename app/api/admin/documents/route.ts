import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { createDocument, DocumentLockedError } from "@/src/features/docgen/firestore/docRepo";
import { parseJsonBody } from "@/src/lib/validation";
import { z } from "zod";
import { getState } from "@/src/lib/e2eeStore";
import { deviceBelongsTo, envelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";

export const dynamic = "force-dynamic";

/** Firestore doc IDs only: no "/" so a caller cannot write outside the documents collection. */
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const INPUT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_INPUT_FIELDS = 100;

const documentSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
  templateTitle: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  inputs: z
    .record(z.string().regex(INPUT_KEY_PATTERN), z.string().max(10_000))
    .refine(value => Object.keys(value).length <= MAX_INPUT_FIELDS, { message: "Too many inputs" })
    .optional(),
  docId: z.string().regex(DOC_ID_PATTERN).optional(),
  // With encryption on, inputs travel as `enc`, bound to `docId` (chosen by the browser).
  enc: envelopeSchema.optional()
});

export async function POST(req: NextRequest) {
  try {
    const { actor } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, documentSchema);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const e2eeOn = (await getState()).enabled;
    if (e2eeOn && payload.inputs !== undefined) {
      return NextResponse.json({ error: "Encryption is on: document inputs must be sent encrypted.", code: "E2EE_REQUIRED" }, { status: 400 });
    }
    if (payload.enc) {
      if (!e2eeOn || !payload.docId) return NextResponse.json({ error: "Invalid encrypted document" }, { status: 400 });
      if (!(await deviceBelongsTo(payload.enc as EnvelopeInput, actor.uid))) {
        return NextResponse.json({ error: "Unknown or inactive encryption device." }, { status: 403 });
      }
    }
    const saved = await createDocument({
      templateId: payload.templateId,
      templateTitle: payload.templateTitle,
      category: payload.category ?? "General",
      inputs: payload.inputs,
      enc: payload.enc,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      createdByName: actor.name,
      createdByRoles: actor.roles,
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
    if (error instanceof DocumentLockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Document save failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
