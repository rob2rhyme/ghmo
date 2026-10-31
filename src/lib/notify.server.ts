import "server-only";
import { getAdminDb } from "./firebaseAdmin";
import { orgAdminsCollectionPath } from "./firestorePaths";
import { COMMUNITY_SLUG } from "./community";
import { isMailConfigured, sendMail } from "./mailer.server";
import { notificationMessage, pickRecipients, type NotificationKind, type NotifyCandidate } from "./notifications";
import { checkRateLimit } from "./rateLimit";

const THROTTLE_MS = 30 * 60 * 1000;

/**
 * Emails the other opted-in admins that there is activity. Best effort: failures never block the
 * action that caused them. Each person gets at most one email per kind every 30 minutes.
 */
export async function notifyAdmins(kind: NotificationKind, actorUid: string, origin: string, onlyUids?: string[]): Promise<number> {
  if (!isMailConfigured()) return 0;
  try {
    const snap = await getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG)).get();
    const candidates: NotifyCandidate[] = snap.docs.map(doc => {
      const data = doc.data();
      return { uid: doc.id, email: data.email ?? data.emailLower, status: data.status, notifyEmail: data.notifyEmail };
    });
    const message = notificationMessage(kind, origin);
    let sent = 0;
    for (const recipient of pickRecipients(candidates, actorUid, onlyUids)) {
      if (!(await checkRateLimit(`notify:${recipient.uid}:${kind}`, 1, THROTTLE_MS)).success) continue;
      if (await sendMail({ to: recipient.email, ...message })) sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("Notification failed", error instanceof Error ? error.name : "unknown");
    return 0;
  }
}
