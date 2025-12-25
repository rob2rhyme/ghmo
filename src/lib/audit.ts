//src/lib/audit.ts
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

function sanitizeFirestorePayload<T>(value: T): T {
  if (value === undefined) return value;

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeFirestorePayload(item))
      .filter((item) => item !== undefined) as unknown as T;
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

export async function logAudit(params: {
  communityId?: string;
  orgSlug?: string;
  type: AuditType;
  summary?: string;
  actorUid?: string;
  role?: string;
  ip?: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { communityId, orgSlug, ...rest } = params;
  const resolvedOrg = orgSlug || (communityId === COMMUNITY_ID ? COMMUNITY_SLUG : COMMUNITY_SLUG);
  const ref = adminDb.collection(orgAuditLogsCollectionPath(resolvedOrg));
  const payload = sanitizeFirestorePayload({
    ...rest,
    createdAt: Timestamp.now()
  });

  await ref.add(payload);
}
