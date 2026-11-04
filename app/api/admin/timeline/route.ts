import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { orgTimelineCollectionPath } from "@/src/lib/firestorePaths";
import { toPlain } from "@/src/lib/serialize.server";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

// Deprecated feature (no UI caller); still bounded so it cannot be used to write arbitrary data.
const docIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(value => !value.includes("/") && value !== "." && value !== "..", "Invalid id");
const titleSchema = z.string().max(200);
const bodyTextSchema = z.string().max(20_000);
const tagsSchema = z.array(z.string().trim().max(50)).max(50);
const attachmentSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine(value => /^https?:\/\//i.test(value), "Only http(s) URLs are allowed"),
  name: z.string().max(200).optional(),
  contentType: z.string().max(100).optional()
});

const createSchema = z.object({
  title: titleSchema.refine(value => value.trim().length > 0, "Title is required"),
  body: bodyTextSchema.optional(),
  timestamp: z
    .union([z.string().max(64), z.number().finite()])
    .refine(value => !Number.isNaN(new Date(value).getTime()), "Invalid timestamp")
    .optional(),
  tags: tagsSchema.optional(),
  attachments: z.array(attachmentSchema).max(20).optional()
});

const updateSchema = z.object({
  id: docIdSchema,
  title: titleSchema.optional(),
  body: bodyTextSchema.optional(),
  tags: tagsSchema.optional()
});

export async function GET(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const primarySnap = await getAdminDb()
      .collection(orgTimelineCollectionPath(COMMUNITY_SLUG))
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const sourceDocs = primarySnap.docs;
    const items = sourceDocs.map(doc => {
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
    return NextResponse.json(toPlain({ items }));
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

export async function POST(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;
    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;
    const ref = getAdminDb().collection(orgTimelineCollectionPath(COMMUNITY_SLUG));
    const doc = await ref.add({
      title: data.title,
      body: data.body ?? "",
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: actor.uid,
      tags: data.tags || [],
      attachments: data.attachments || []
    });
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "timeline_created",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "timeline_entry", id: doc.id, summary: `Created timeline entry: ${data.title}` },
      meta: { timelineId: doc.id, title: data.title, route: "/api/admin/timeline" }
    });
    return NextResponse.json({ ok: true, id: doc.id });
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

export async function PATCH(req: NextRequest) {
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json(
      { error: "This can't be loaded right now. Try again in a few minutes." },
      { status: 503 }
    );
  }

  try {
    const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, title, body, tags } = parsed.data;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (title !== undefined && !title.trim())
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });

    const ref = getAdminDb().collection(orgTimelineCollectionPath(COMMUNITY_SLUG)).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const beforeData = snap.data() || {};

    const updates: Record<string, any> = { updatedAt: new Date() };
    const changed: string[] = [];
    if (title !== undefined) {
      updates.title = title;
      changed.push("title");
    }
    if (body !== undefined) {
      updates.body = body;
      changed.push("body");
    }
    if (Array.isArray(tags)) {
      updates.tags = tags;
      changed.push("tags");
    }
    await ref.set(updates, { merge: true });
    const updatedSnap = await ref.get();
    const data = updatedSnap.data() || {};
    const ts = data.timestamp;
    const timestamp =
      typeof ts?.toMillis === "function"
        ? ts.toMillis()
        : ts instanceof Date
          ? ts.getTime()
          : typeof ts === "number"
            ? ts
            : null;

    const afterData = updatedSnap.data() as Record<string, unknown>;
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "timeline_updated",
      actor: {
        uid: actor.uid,
        adminId: actor.adminDocId,
        name: actor.name,
        email: actor.email,
        role: actor.roles[0] ?? "admin"
      },
      resource: { type: "timeline_entry", id, summary: `Updated timeline entry: ${data.title || id}` },
      before: toPlain({ id, ...beforeData }),
      after: toPlain({ id, ...afterData }),
      meta: { action: "timeline_update", timelineId: id, changedFields: changed, route: "/api/admin/timeline" }
    });

    return NextResponse.json(toPlain({ ok: true, item: { id, ...data, timestamp } }));
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
