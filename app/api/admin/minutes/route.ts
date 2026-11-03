import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMinutesCollectionPath } from "@/src/lib/firestorePaths";
import { eventsCollectionPath } from "@/src/lib/events";
import { COMMUNITY_SLUG, COMMUNITY_ID } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";
import { meetingTypes, MeetingAttendance, MeetingType } from "@/src/lib/minutes";
import { resolveActorName } from "@/src/lib/actor";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { getState } from "@/src/lib/e2eeStore";
import { deviceBelongsTo, envelopeSchema, type EnvelopeInput } from "@/src/lib/e2eeEnvelope.server";
import { CONTENT_FIELDS, adminView, auditView } from "@/src/lib/minutesRecords";
import { normalizeAttendance, normalizeContent } from "@/src/lib/minutesContent";
import { planTransition } from "@/src/lib/minutesWorkflow";
import { getAppOrigin } from "@/src/lib/appUrl";
import { notifyAdmins } from "@/src/lib/notify.server";
import { listAdminMinutes } from "@/src/lib/adminData.server";
import { expirePublicCache, PUBLIC_CACHE_TAGS } from "@/src/lib/publicCache.server";

export const dynamic = "force-dynamic";

const MAX_LIST_ITEMS = 200;
const MAX_LINE_LENGTH = 2000;
const MAX_NAME_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 50_000;

// Firestore document id: no "/" (would address a nested path) and not "." / "..".
const docIdSchema = z
  .string()
  .trim()
  .max(200)
  .refine(value => !value.includes("/") && value !== "." && value !== "..", "Invalid id");

const meetingTypeSchema = z.enum(meetingTypes as [MeetingType, ...MeetingType[]]);
const lineListSchema = z.array(z.string().max(MAX_LINE_LENGTH)).max(MAX_LIST_ITEMS);
const nameListSchema = z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_LIST_ITEMS);

const actionItemSchema = z.object({
  task: z.string().max(MAX_LINE_LENGTH),
  assignedTo: z.string().max(MAX_NAME_LENGTH).nullish(),
  dueDate: z.union([z.string().max(64), z.number().finite()]).nullish()
});

// Legacy records may send attendance as a bare list of present names.
const attendanceSchema = z.union([
  nameListSchema,
  z.object({
    present: nameListSchema.optional(),
    absent: nameListSchema.optional(),
    guests: nameListSchema.optional()
  })
]);

const signaturesSchema = z.object({
  chairName: z.string().max(MAX_NAME_LENGTH).optional(),
  secretaryName: z.string().max(MAX_NAME_LENGTH).optional()
});

const minutesFieldsSchema = {
  meetingType: meetingTypeSchema,
  chairedBy: z.string().max(MAX_NAME_LENGTH).nullish(),
  agenda: lineListSchema.optional(),
  discussionSummary: z.string().max(MAX_SUMMARY_LENGTH).nullish(),
  decisions: lineListSchema.optional(),
  actionItems: z.array(actionItemSchema).max(MAX_LIST_ITEMS).optional(),
  attendance: attendanceSchema.nullish(),
  signatures: signaturesSchema.nullish()
};

// With encryption on, content travels only as `enc` (and approval notes as `approvalEnc`).
// Approving also publishes a plaintext copy of the saved content, which the approver's browser supplies.
const publishedSchema = z.object({
  chairedBy: minutesFieldsSchema.chairedBy,
  agenda: minutesFieldsSchema.agenda,
  discussionSummary: minutesFieldsSchema.discussionSummary,
  decisions: minutesFieldsSchema.decisions,
  actionItems: minutesFieldsSchema.actionItems,
  attendance: minutesFieldsSchema.attendance,
  signatures: minutesFieldsSchema.signatures
});

const createMinutesSchema = z.object({
  ...minutesFieldsSchema,
  eventId: docIdSchema,
  // Chosen by the browser so the ciphertext can be bound to its document.
  id: docIdSchema.optional(),
  enc: envelopeSchema.optional()
});

const updateMinutesSchema = z.object({
  ...minutesFieldsSchema,
  meetingType: meetingTypeSchema.optional(),
  id: docIdSchema,
  action: z.enum(["submit", "approve", "returnToDraft"]).optional(),
  approvalNotes: z.string().max(5000).nullish(),
  enc: envelopeSchema.optional(),
  approvalEnc: envelopeSchema.optional(),
  published: publishedSchema.optional(),
  // Hash of the content being submitted (see minutesContent.ts); needed for encrypted minutes.
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  // Why approved minutes are being reopened.
  reason: z.string().trim().max(1000).optional()
});

const E2EE_REQUIRED = { error: "Encryption is on: minutes content must be sent encrypted.", code: "E2EE_REQUIRED" };

function hasPlainContent(payload: Record<string, unknown>) {
  return [...CONTENT_FIELDS, "approvalNotes"].some(key => payload[key] !== undefined);
}

function auditLabel(action: string) {
  return (
    { minutes_submitted: "Submitted minutes", minutes_approved: "Approved minutes", minutes_reopened: "Reopened minutes", minutes_returned_to_draft: "Returned minutes to draft" }[action] ??
    "Updated minutes"
  );
}

/** Plaintext content fields in the request (only used before encryption is on), in stored form. */
function legacyContentUpdates(payload: Record<string, any>) {
  const updates: Record<string, unknown> = {};
  if (payload.chairedBy !== undefined) updates.chairedBy = sanitizeText(payload.chairedBy) ?? null;
  if (payload.discussionSummary !== undefined) updates.discussionSummary = sanitizeText(payload.discussionSummary) ?? null;
  if (Array.isArray(payload.agenda)) updates.agenda = ensureStringArray(payload.agenda);
  if (Array.isArray(payload.decisions)) updates.decisions = ensureStringArray(payload.decisions);
  if (payload.attendance !== undefined) updates.attendance = normalizeAttendance(payload.attendance) ?? null;
  if (Array.isArray(payload.actionItems)) updates.actionItems = normalizeContent({ actionItems: payload.actionItems }).actionItems;
  if (payload.signatures !== undefined) updates.signatures = sanitizeSignatures(payload.signatures) ?? null;
  return updates;
}

type MinutesActionItem = { task: string; assignedTo?: string; dueDate?: Date };

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function ensureStringArray(value?: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function sanitizeSignatures(value?: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const chair = typeof (value as any).chairName === "string" ? (value as any).chairName.trim() : "";
  const secretary = typeof (value as any).secretaryName === "string" ? (value as any).secretaryName.trim() : "";
  const result: Record<string, string> = {};
  if (chair) result.chairName = chair;
  if (secretary) result.secretaryName = secretary;
  return Object.keys(result).length ? result : undefined;
}

function isMinutesActionItem(value: MinutesActionItem | null): value is MinutesActionItem {
  return value !== null;
}

function sanitizeActionItems(value?: unknown[]): MinutesActionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): MinutesActionItem | null => {
      if (!item || typeof item !== "object") return null;
      const task = typeof (item as any).task === "string" ? (item as any).task.trim() : "";
      if (!task) return null;
      const assignedTo = typeof (item as any).assignedTo === "string" ? (item as any).assignedTo.trim() : undefined;
      const dueDateValue = (item as any).dueDate;
      const dueDate =
        typeof dueDateValue === "string" || typeof dueDateValue === "number"
          ? dueDateValue
            ? new Date(dueDateValue)
            : null
          : dueDateValue instanceof Date
            ? dueDateValue
            : null;
      const normalizedDueDate = dueDate instanceof Date && !isNaN(dueDate.getTime()) ? dueDate : undefined;
      return {
        task,
        ...(assignedTo ? { assignedTo } : {}),
        ...(normalizedDueDate ? { dueDate: normalizedDueDate } : {})
      };
    })
    .filter(isMinutesActionItem);
}

function sanitizeAttendanceList(value?: unknown[]) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function sanitizeAttendancePayload(value?: unknown): MeetingAttendance | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const present = sanitizeAttendanceList(value);
    if (!present.length) return undefined;
    return { present };
  }
  if (typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const present = sanitizeAttendanceList(Array.isArray(data.present) ? (data.present as unknown[]) : undefined);
  const absent = sanitizeAttendanceList(Array.isArray(data.absent) ? (data.absent as unknown[]) : undefined);
  const guests = sanitizeAttendanceList(Array.isArray(data.guests) ? (data.guests as unknown[]) : undefined);
  if (!present.length && !absent.length && !guests.length) return undefined;
  const result: MeetingAttendance = { present };
  if (absent.length) result.absent = absent;
  if (guests.length) result.guests = guests;
  return result;
}

async function resolveEventDocument(eventId: string) {
  const db = getAdminDb();
  const candidates = [
    db.collection(eventsCollectionPath(COMMUNITY_SLUG)).doc(eventId),
    db.collection(eventsCollectionPath(COMMUNITY_ID)).doc(eventId),
    db.collection(`community/${COMMUNITY_ID}/events`).doc(eventId)
  ];
  for (const ref of candidates) {
    const snap = await ref.get();
    if (snap.exists) {
      return snap;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;

    const { searchParams } = new URL(req.url);
    const versionsFor = searchParams.get("versionsFor");
    if (versionsFor) {
      const idCheck = docIdSchema.safeParse(versionsFor);
      if (!idCheck.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      const versions = await getAdminDb()
        .collection(orgMinutesCollectionPath(COMMUNITY_SLUG))
        .doc(idCheck.data)
        .collection("versions")
        .orderBy("version", "desc")
        .get();
      return NextResponse.json({ ok: true, versions: versions.docs.map(d => toPlain(d.data())) });
    }
    const items = await listAdminMinutes(guard, { eventId: searchParams.get("eventId") });
    return NextResponse.json({ ok: true, minutes: items });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;
    const parsed = await parseJsonBody(req, createMinutesSchema);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const db = getAdminDb();

    const eventId = payload.eventId;
    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const meetingType = payload.meetingType;

    const e2eeOn = (await getState()).enabled;
    if (e2eeOn && hasPlainContent(payload)) return NextResponse.json(E2EE_REQUIRED, { status: 400 });
    if (payload.enc) {
      if (!e2eeOn) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
      if (!payload.id) return NextResponse.json({ error: "id is required for encrypted minutes" }, { status: 400 });
      if (!(await deviceBelongsTo(payload.enc as EnvelopeInput, actor.uid))) {
        return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
      }
    }

    const eventSnap = await resolveEventDocument(eventId);
    if (!eventSnap) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const eventData = eventSnap.data() || {};

    const existingSnap = await db
      .collection(orgMinutesCollectionPath(COMMUNITY_SLUG))
      .where("eventId", "==", eventId)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      return NextResponse.json({ error: "Minutes already exist for this event" }, { status: 409 });
    }

    const agenda = ensureStringArray(payload.agenda);
    const decisions = ensureStringArray(payload.decisions);
    const attendance = sanitizeAttendancePayload(payload.attendance);
    const actionItems = sanitizeActionItems(payload.actionItems ?? []);
    const signatures = sanitizeSignatures(payload.signatures);

    const minutesRef = db.collection(orgMinutesCollectionPath(COMMUNITY_SLUG));
    const newRef = payload.id ? minutesRef.doc(payload.id) : minutesRef.doc();
    const now = new Date();
    const document: Record<string, unknown> = {
      eventId,
      eventTitle: eventData.title || "Untitled Event",
      eventDate: eventData.startsAt || null,
      meetingType,
      recordedBy: resolveActorName(actor),
      ...(payload.enc
        ? { enc: payload.enc }
        : {
            chairedBy: sanitizeText(payload.chairedBy),
            agenda,
            discussionSummary: sanitizeText(payload.discussionSummary),
            decisions,
            actionItems,
            ...(attendance ? { attendance } : {}),
            ...(signatures ? { signatures } : {})
          }),
      status: "draft",
      createdAt: now,
      updatedAt: now
    };
    if (!document.chairedBy) {
      delete document.chairedBy;
    }
    if (!document.discussionSummary) {
      delete document.discussionSummary;
    }
    if (!signatures) {
      delete document.signatures;
    }

    // create() refuses an id that already exists, so a client can't overwrite someone else's minutes.
    await newRef.create(document);
    expirePublicCache(PUBLIC_CACHE_TAGS.minutes);
    const createdDoc = newRef;

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "minutes_created",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "meeting_minutes", id: createdDoc.id, summary: `Minutes for ${document.eventTitle}` },
      meta: { eventId, route: "/api/admin/minutes" }
    });

    const savedDoc = await createdDoc.get();
    return NextResponse.json({ ok: true, minutes: toPlain(adminView({ id: createdDoc.id, ...savedDoc.data() })) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    throw error;
  }
}

type MinutesAction = "submit" | "approve" | "returnToDraft";

export async function PATCH(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured" },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;
    const parsed = await parseJsonBody(req, updateMinutesSchema);
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const db = getAdminDb();

    const id = payload.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ref = db.collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).doc(id);
    const action: MinutesAction | undefined = payload.action;
    // The meeting type is shown publicly but isn't part of the approval fingerprint, so it can only change while editing.
    if (action && payload.meetingType) {
      return NextResponse.json({ error: "Change the meeting type while editing, not with a status change." }, { status: 400 });
    }

    const e2eeOn = (await getState()).enabled;
    if (e2eeOn && hasPlainContent(payload)) return NextResponse.json(E2EE_REQUIRED, { status: 400 });
    if (!e2eeOn && (payload.enc || payload.approvalEnc || payload.published)) {
      return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
    }
    for (const envelope of [payload.enc, payload.approvalEnc]) {
      if (envelope && !(await deviceBelongsTo(envelope as EnvelopeInput, actor.uid))) {
        return NextResponse.json({ error: "This device isn't set up for encryption, or was removed. Open Encryption to check." }, { status: 403 });
      }
    }

    // Read, decide and write in one transaction, so two admins can't act on the same stale record.
    const outcome = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: "Not found", status: 404 } as const;
      const before = snap.data() || {};
      const plainEdits = legacyContentUpdates(payload);
      const editsContent = Boolean(payload.enc) || Object.keys(plainEdits).length > 0;

      const plan = await planTransition({
        before,
        action,
        editsContent,
        actorUid: actor.uid,
        now: new Date(),
        deleteField: FieldValue.delete(),
        contentHash: payload.contentHash,
        published: payload.published as Record<string, unknown> | undefined,
        approvalEnc: payload.approvalEnc,
        approvalNotes: payload.approvalNotes ?? undefined,
        reason: payload.reason
      });
      if (!plan.ok) return { error: plan.error, status: plan.status, code: plan.code } as const;

      const updates: Record<string, unknown> = { updatedAt: new Date(), ...plainEdits, ...plan.updates };
      if (payload.meetingType) updates.meetingType = payload.meetingType;
      if (payload.enc) {
        updates.enc = payload.enc;
        // Saving encrypted content replaces any plaintext left from before encryption was on.
        for (const field of [...CONTENT_FIELDS, "approvalNotes"]) {
          if (before[field] !== undefined) updates[field] = FieldValue.delete();
        }
      }
      tx.update(ref, updates);
      if (plan.version) tx.set(ref.collection("versions").doc(String(plan.version.version)), plan.version);
      return { before, audit: plan.audit } as const;
    });
    if ("error" in outcome) {
      return NextResponse.json({ error: outcome.error, ...("code" in outcome && outcome.code ? { code: outcome.code } : {}) }, { status: outcome.status });
    }
    // Expire right after the write, so a failed audit write can't leave unpublished minutes showing.
    expirePublicCache(PUBLIC_CACHE_TAGS.minutes);

    const afterSnap = await ref.get();
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: outcome.audit,
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "meeting_minutes", id, summary: `${auditLabel(outcome.audit)} for ${afterSnap.data()?.eventTitle || id}` },
      before: toPlain(auditView({ id, ...outcome.before })),
      after: toPlain(auditView({ id, ...afterSnap.data() })),
      meta: { minutesId: id, route: "/api/admin/minutes", action, ...(payload.reason ? { reason: payload.reason } : {}) }
    });

    // Tell the other opted-in admins there is something to approve (content-free, best effort).
    if (outcome.audit === "minutes_submitted") void notifyAdmins("minutes_submitted", actor.uid, getAppOrigin(req));
    return NextResponse.json({ ok: true, minutes: toPlain(adminView({ id, ...afterSnap.data() })) });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json(
        { error: "Admin env not configured" },
        { status: 503 }
      );
    }
    throw error;
  }
}
