import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";

type AuditType = "auth_attempt" | "admin_action" | "doc_generated" | "webhook_received" | "pin_login" | "reconcile";

export async function logAudit(params: {
  communityId: string;
  type: AuditType;
  actorUid?: string;
  role?: string;
  ip?: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { communityId, ...rest } = params;
  const ref = adminDb.collection(`community/${communityId}/auditLogs`);
  await ref.add({
    ...rest,
    timestamp: Timestamp.now()
  });
}
