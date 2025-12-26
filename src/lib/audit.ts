import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { orgAuditLogsCollectionPath } from "./firestorePaths";

type AuditType =
  | "pin_login"
  | "auth_attempt"
  | "admin_pin_created"
  | "admin_pin_deleted"
  | "event_created"
  | "event_updated"
  | "event_deleted"
  | "timeline_created"
  | "timeline_updated"
  | "timeline_deleted"
  | "home_blocks_updated"
  | "doc_generated"
  | "webhook_received"
  | "reconcile"
  | "admin_action";

type AuditActor = {
  uid?: string;
  adminId?: string;
  name?: string;
  email?: string;
  role?: string;
};

type AuditResource = {
  type?: string;
  id?: string;
  path?: string;
  summary?: string;
};

type AuditMeta = {
  ip?: string;
  userAgent?: string | null;
  route?: string;
  requestId?: string;
  [key: string]: unknown;
};

function sanitizeFirestorePayload<T>(value: T): T {
  if (value === undefined) return value;

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map(item => sanitizeFirestorePayload(item))
      .filter(item => item !== undefined) as unknown as T;
    return sanitizedArray;
  }

  if (value && typeof value === "object") {
    if (value instanceof Date || value instanceof Timestamp) return value;

    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) {
      const sanitizedObject: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        const sanitizedValue = sanitizeFirestorePayload(nestedValue);
        if (sanitizedValue !== undefined) {
          sanitizedObject[key] = sanitizedValue;
        }
      }
      return sanitizedObject as unknown as T;
    }
  }

  return value;
}

export async function logAuditEvent(params: {
  orgSlug: string;
  action: string;
  actor?: AuditActor;
  resource?: AuditResource;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: AuditMeta;
}) {
  const ref = adminDb.collection(orgAuditLogsCollectionPath(params.orgSlug));
  const payload = sanitizeFirestorePayload({
    action: params.action,
    actor: params.actor,
    resource: params.resource,
    before: params.before,
    after: params.after,
    meta: params.meta,
    createdAt: Timestamp.now()
  });
  await ref.add(payload);
}

export async function logAudit(params: {
  communityId?: string;
  orgSlug?: string;
  type: AuditType;
  summary?: string;
  actorUid?: string;
  adminId?: string;
  name?: string;
  email?: string;
  role?: string;
  ip?: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { communityId, orgSlug, metadata, ip, userAgent, ...rest } = params;
  const resolvedOrg = orgSlug || (communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG);
  await logAuditEvent({
    orgSlug: resolvedOrg,
    action: rest.type,
    actor: rest.actorUid
      ? { uid: rest.actorUid, adminId: rest.adminId, name: rest.name, email: rest.email, role: rest.role }
      : undefined,
    resource: rest.summary ? { summary: rest.summary } : undefined,
    meta: { ip, userAgent, ...metadata }
  });
}
