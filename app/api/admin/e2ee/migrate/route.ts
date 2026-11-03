import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { deviceBelongsTo, largeEnvelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";
import { getState } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import {
  MIGRATION_AREAS,
  envelopeField,
  plainFields,
  plaintextFieldsToDelete,
  type MigrationArea,
  type MigrationItem
} from "@/src/lib/e2eeMigration";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ORG = "organizations/ghmo";
const THREADS = `${ORG}/commsThreads`;
const PAGE_SIZE = 25;

const areaSchema = z.enum(MIGRATION_AREAS);
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

function docPath(area: MigrationArea, id: string, parentId?: string) {
  switch (area) {
    case "chat":
      return `${ORG}/adminChatMessages/${id}`;
    case "threads":
    case "conclusions":
      return `${THREADS}/${id}`;
    case "comments":
      return `${THREADS}/${parentId}/comments/${id}`;
    case "votes":
      return `${THREADS}/${parentId}/conclusionVotes/${id}`;
    case "minutes":
      return `${ORG}/minutes/${id}`;
    case "documents":
      return `${ORG}/documents/${id}`;
    case "actionStatus":
      return `${ORG}/actionItemStatus/${id}`;
  }
}

/** Every record in an area that still holds plaintext (small collections, so a full scan is fine). */
async function findPending(area: MigrationArea): Promise<MigrationItem[]> {
  const db = getAdminDb();
  const items: MigrationItem[] = [];
  const consider = (snap: FirebaseFirestore.QueryDocumentSnapshot, parentId?: string) => {
    const plain = plainFields(area, snap.data());
    if (plain) items.push({ area, id: snap.id, parentId, updateTime: snap.updateTime.toDate().toISOString(), plain });
  };
  switch (area) {
    case "chat":
      (await db.collection(`${ORG}/adminChatMessages`).get()).docs.forEach(d => consider(d));
      break;
    case "threads":
    case "conclusions":
      (await db.collection(THREADS).get()).docs.forEach(d => consider(d));
      break;
    case "comments":
    case "votes": {
      const threads = await db.collection(THREADS).select().get();
      const sub = area === "comments" ? "comments" : "conclusionVotes";
      for (const thread of threads.docs) {
        (await thread.ref.collection(sub).get()).docs.forEach(d => consider(d, thread.id));
      }
      break;
    }
    case "minutes":
      (await db.collection(`${ORG}/minutes`).get()).docs.forEach(d => consider(d));
      break;
    case "documents":
      (await db.collection(`${ORG}/documents`).get()).docs.forEach(d => consider(d));
      break;
    case "actionStatus":
      (await db.collection(`${ORG}/actionItemStatus`).get()).docs.forEach(d => consider(d));
      break;
  }
  return items;
}

/** Records written before encryption was turned on, ready for the browser to encrypt. */
export const GET = e2eeRoute(async (req, guard) => {
  if (!(await getState()).enabled) return NextResponse.json({ error: "Encryption is not on yet." }, { status: 409 });
  const parsed = areaSchema.safeParse(req.nextUrl.searchParams.get("area"));
  if (!parsed.success) return NextResponse.json({ error: "Unknown area" }, { status: 400 });
  void guard;
  const pending = await findPending(parsed.data);
  return NextResponse.json({ ok: true, items: pending.slice(0, PAGE_SIZE), remaining: pending.length });
});

const swapSchema = z.object({
  area: areaSchema,
  id: idSchema,
  parentId: idSchema.optional(),
  updateTime: z.string().max(64),
  enc: largeEnvelopeSchema
});

/**
 * Swaps a record's plaintext for the envelope the browser made and checked.
 * Refused if the record changed since it was read, or the envelope isn't from the caller's own device.
 */
export const POST = e2eeRoute(async (req: NextRequest, guard) => {
  const parsed = await parseJsonBody(req, swapSchema, { maxBytes: 1_500_000 });
  if (!parsed.ok) return parsed.response;
  const { area, id, parentId, updateTime, enc } = parsed.data;
  if ((area === "comments" || area === "votes") !== Boolean(parentId)) {
    return NextResponse.json({ error: "Invalid record" }, { status: 400 });
  }
  if (!(await getState()).enabled) return NextResponse.json({ error: "Encryption is not on yet." }, { status: 409 });
  if (!(await deviceBelongsTo(enc as EnvelopeInput, guard.actor.uid))) {
    return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
  }

  const ref = getAdminDb().doc(docPath(area, id, parentId));
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const current = snap.updateTime!;
  if (current.toDate().toISOString() !== updateTime) {
    return NextResponse.json({ error: "The record changed; try again.", code: "CHANGED" }, { status: 409 });
  }
  if (!plainFields(area, snap.data() ?? {})) {
    return NextResponse.json({ error: "Nothing to migrate for this record." }, { status: 409 });
  }

  const updates: Record<string, unknown> = { [envelopeField(area)]: enc };
  for (const field of plaintextFieldsToDelete(area)) updates[field] = FieldValue.delete();
  await ref.update(updates, { lastUpdateTime: current });
  await auditKeyring(req, guard, "e2ee_record_migrated", `Encrypted existing ${area} record`, id);
  return NextResponse.json({ ok: true });
});
