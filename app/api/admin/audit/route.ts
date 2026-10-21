import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Actions the admin UI reports from the client (comms board, admin chat). Anything
 * else is server-originated and must not be forgeable through this endpoint.
 */
const CLIENT_AUDIT_ACTIONS = [
  "admin_chat_message_sent",
  "comms_thread_created",
  "comms_comment_created",
  "comms_conclusion_vote",
  "comms_conclusion_proposed",
  "comms_thread_closed"
] as const;

// Meta keys the server owns; a client must not be able to spoof them.
const RESERVED_META_KEYS = new Set(["ip", "userAgent", "route", "requestId"]);

const bodySchema = z.object({
  action: z.enum(CLIENT_AUDIT_ACTIONS),
  resource: z
    .object({
      type: z.string().trim().max(64).optional(),
      id: z.string().trim().max(200).optional(),
      path: z.string().trim().max(500).optional(),
      // Clients send thread titles here; truncate rather than reject long ones.
      summary: z
        .string()
        .max(5000)
        .transform(value => value.slice(0, 500))
        .optional()
    })
    .optional(),
  meta: z
    .record(z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))
    .refine(value => Object.keys(value).length <= 20, "Too many meta keys")
    .optional()
});

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

    const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 16 * 1024 });
    if (!parsed.ok) return parsed.response;
    const payload = parsed.data;
    const action = payload.action;
    const meta = payload.meta
      ? Object.fromEntries(Object.entries(payload.meta).filter(([key]) => !RESERVED_META_KEYS.has(key)))
      : undefined;

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action,
      actor: { uid: actor.uid, adminId: actor.adminDocId, name: actor.name, roles: actor.roles },
      resource: payload.resource,
      meta: { ...meta, route: "/api/admin/audit" }
    });

    return NextResponse.json({ ok: true });
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
