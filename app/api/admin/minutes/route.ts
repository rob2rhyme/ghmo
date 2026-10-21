import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const createMinutesSchema = z.object({
  ...minutesFieldsSchema,
  eventId: docIdSchema
});

const updateMinutesSchema = z.object({
  ...minutesFieldsSchema,
  meetingType: meetingTypeSchema.optional(),
  id: docIdSchema,
  action: z.enum(["submit", "approve", "returnToDraft"]).optional(),
  approvalNotes: z.string().max(5000).nullish()
});

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
        assignedTo: assignedTo || undefined,
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
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;

    const { searchParams } = new URL(req.url);
    const filterEventId = searchParams.get("eventId");
    const minutesPath = orgMinutesCollectionPath(COMMUNITY_SLUG);
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(minutesPath);
    if (filterEventId) {
      query = query.where("eventId", "==", filterEventId);
    }
    query = query.orderBy("eventDate", "desc").limit(100);
    const snap = await query.get();
    const items = snap.docs.map(doc => toPlain({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ ok: true, minutes: items });
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

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
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
    const now = new Date();
    const document: Record<string, unknown> = {
      eventId,
      eventTitle: eventData.title || "Untitled Event",
      eventDate: eventData.startsAt || null,
      meetingType,
      chairedBy: sanitizeText(payload.chairedBy),
      recordedBy: resolveActorName(actor),
      agenda,
      discussionSummary: sanitizeText(payload.discussionSummary),
      decisions,
      actionItems,
      ...(attendance ? { attendance } : {}),
      ...(signatures ? { signatures } : {}),
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

    const createdDoc = await minutesRef.add(document);

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
    return NextResponse.json({ ok: true, minutes: toPlain({ id: createdDoc.id, ...savedDoc.data() }) });
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

type MinutesAction = "submit" | "approve" | "returnToDraft";

export async function PATCH(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "Admin env not configured", missing: adminEnvStatus.missing },
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
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const beforeData = snap.data() || {};
    const action: MinutesAction | undefined = payload.action;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (payload.meetingType) updates.meetingType = payload.meetingType;
    if (payload.chairedBy !== undefined) updates.chairedBy = sanitizeText(payload.chairedBy) ?? null;
    if (payload.discussionSummary !== undefined) updates.discussionSummary = sanitizeText(payload.discussionSummary) ?? null;
    if (Array.isArray(payload.agenda)) updates.agenda = ensureStringArray(payload.agenda);
    if (Array.isArray(payload.decisions)) updates.decisions = ensureStringArray(payload.decisions);
    if (payload.attendance !== undefined) {
      const attendanceUpdate = sanitizeAttendancePayload(payload.attendance);
      updates.attendance = attendanceUpdate ?? null;
    }
    if (Array.isArray(payload.actionItems)) {
      updates.actionItems = sanitizeActionItems(payload.actionItems);
    }
    if (payload.signatures !== undefined) {
      const sig = sanitizeSignatures(payload.signatures);
      updates.signatures = sig ?? null;
    }

    if (action) {
      const statusChanged = applyStatusAction(
        updates,
        action,
        beforeData,
        actor.uid,
        payload.approvalNotes ?? undefined
      );
      if (!statusChanged) {
        return NextResponse.json({ error: "Action not allowed" }, { status: 400 });
      }
    } else {
      if (beforeData.status === "approved") {
        return NextResponse.json({ error: "Cannot edit approved minutes" }, { status: 403 });
      }
    }
    await ref.set(updates, { merge: true });
    const afterSnap = await ref.get();

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "minutes_updated",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "meeting_minutes", id, summary: `Updated minutes for ${afterSnap.data()?.eventTitle || id}` },
      before: toPlain({ id, ...beforeData }),
      after: toPlain({ id, ...afterSnap.data() }),
      meta: { minutesId: id, route: "/api/admin/minutes", action }
    });

    return NextResponse.json({ ok: true, minutes: toPlain({ id, ...afterSnap.data() }) });
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

function applyStatusAction(
  updates: Record<string, any>,
  action: MinutesAction,
  beforeData: Record<string, any>,
  actorUid: string,
  approvalNotes?: string
) {
  const now = new Date();
  let changed = false;
  switch (action) {
    case "submit":
      if (beforeData.status === "submitted") break;
      if (beforeData.status === "approved") break;
      updates.status = "submitted";
      updates.submittedAt = now;
      updates.submittedByUid = actorUid;
      updates.approvedAt = null;
      updates.approvedByUid = null;
      updates.approvalNotes = null;
      changed = true;
      break;
    case "approve":
      if (beforeData.status !== "submitted") return false;
      updates.status = "approved";
      updates.approvedAt = now;
      updates.approvedByUid = actorUid;
      if (approvalNotes !== undefined) {
        updates.approvalNotes = approvalNotes.trim() || null;
      }
      changed = true;
      break;
    case "returnToDraft":
      if (beforeData.status === "draft") break;
      updates.status = "draft";
      updates.submittedAt = null;
      updates.submittedByUid = null;
      updates.approvedAt = null;
      updates.approvedByUid = null;
      updates.approvalNotes = approvalNotes?.trim() ? approvalNotes.trim() : null;
      changed = true;
      break;
  }
  return changed;
}
