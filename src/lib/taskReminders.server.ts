import "server-only";

import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { fail, type Failure } from "./adminRoute.server";
import { footerFromEnv, unsubscribeHeaders, withUnsubscribeFooter } from "./broadcastMail";
import { quotaDay, sendingConfigFromEnv, type SendingConfig } from "./broadcastSending";
import { sendingBlocker } from "./broadcastSender.server";
import { COMMUNITY_SLUG } from "./community";
import { listTasksForEvent, readEventInfo } from "./eventTasks.server";
import { getAdminDb } from "./firebaseAdmin";
import { orgDocPath, orgEventTaskRemindersCollectionPath, orgGroupsCollectionPath, orgMembersCollectionPath } from "./firestorePaths";
import { isMailConfigured, type BatchMessage, type BatchResult } from "./mailer.server";
import { memberEmailState } from "./members";
import { POSITION_TIME_ZONE, todayIn } from "./positions";
import {
  CLAIM_IN_FLIGHT_MS,
  REMINDER_COOLDOWN_MS,
  planReminders,
  reminderEmail,
  taskOwners,
  type ReminderHistory,
  type ReminderMember,
  type ReminderMode,
  type ReminderPlan
} from "./taskReminders";
import { signUnsubscribeToken } from "./unsubscribeToken";
import { toDate } from "./format";

/**
 * Sends the "your tasks" reminders (plan §16, 12-A). One record per event and person holds the last send time and
 * any send in progress, so a second click, a double request or a crashed server function can never email someone
 * twice. Email goes out only to members whose consent is re-read at send time. The daily quota is the broadcast quota.
 *
 *  organizations/ghmo/eventTaskReminders/{eventId}~{memberId}   eventId, memberId, lastSentAt, lastSentBy, count, claimId, claimedAt
 */
const db = () => getAdminDb();
const remindersCol = () => db().collection(orgEventTaskRemindersCollectionPath(COMMUNITY_SLUG));
const reminderRef = (eventId: string, memberId: string) => remindersCol().doc(`${eventId}~${memberId}`);
const membersCol = () => db().collection(orgMembersCollectionPath(COMMUNITY_SLUG));
const quotaRef = (day: string) => db().doc(`${orgDocPath(COMMUNITY_SLUG)}/broadcastQuota/${day}`);

export type ReminderPreview = {
  plan: ReminderPlan;
  event: { id: string; title: string; day: string | null };
  /** Why sending is not possible right now (switched off, no email service, no footer), or null. */
  blocker: string | null;
  /** Emails still allowed today across broadcasts and reminders. */
  quotaLeft: number;
  mode: ReminderMode;
};

export async function readMembers(ids: string[]): Promise<Map<string, ReminderMember & { email?: string }>> {
  const out = new Map<string, ReminderMember & { email?: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db().getAll(...ids.slice(i, i + 100).map(id => membersCol().doc(id)));
    for (const snap of snaps) if (snap.exists) out.set(snap.id, snap.data() as ReminderMember & { email?: string });
  }
  return out;
}

/** Who would be emailed now, from the current tasks, groups, members and reminder history. Changes nothing. */
export async function previewReminders(input: { eventId: string; mode: ReminderMode; now: Date; config?: SendingConfig }): Promise<({ ok: true } & ReminderPreview) | Failure> {
  const event = await readEventInfo(input.eventId);
  if (!event) return fail(404, "That event doesn't exist.");
  const config = input.config ?? sendingConfigFromEnv();
  const tasks = await listTasksForEvent(input.eventId);

  const groupIds = [...new Set(tasks.map(task => task.groupId).filter((id): id is string => Boolean(id)))];
  const groupSnaps = await Promise.all(groupIds.map(id => db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG)).doc(id).get()));
  const groups = groupSnaps.filter(snap => snap.exists).map(snap => ({ id: snap.id, leadMemberId: (snap.get("leadMemberId") as string | null) || null }));

  const ownerIds = [...new Set(tasks.filter(task => task.status === "open").flatMap(task => taskOwners(task, groups)))];
  const [members, historySnap, quota] = await Promise.all([readMembers(ownerIds), remindersCol().where("eventId", "==", input.eventId).get(), quotaRef(quotaDay(input.now)).get()]);
  const history = new Map<string, ReminderHistory>(
    historySnap.docs.map(doc => [doc.get("memberId") as string, { lastSentAt: toDate(doc.get("lastSentAt")), claimedAt: toDate(doc.get("claimedAt")) }])
  );

  const plan = planReminders({ tasks, groups, members, history, mode: input.mode, today: todayIn(input.now, POSITION_TIME_ZONE), now: input.now });
  return {
    ok: true,
    plan,
    event: { id: event.id, title: event.title, day: event.day },
    blocker: sendingBlocker(config, isMailConfigured()),
    quotaLeft: Math.max(0, config.dailyLimit - Number(quota.get("sent") ?? 0)),
    mode: input.mode
  };
}

export type SendDeps = {
  config: SendingConfig;
  origin: string;
  now: Date;
  serverKeys: Uint8Array[];
  sendBatch: (messages: BatchMessage[], idempotencyKey: string) => Promise<BatchResult>;
};

export type SendOutcome = { ok: true; emailed: number; failed: number; skippedAtSend: number; plan: ReminderPlan } | Failure;

/**
 * Emails the people in the plan. In one transaction it re-reads each member's consent and reminder record, drops
 * anyone who has opted out or was just reminded, and reserves the day's quota; then it sends one provider batch with
 * an idempotency key. A failed batch releases the claims and the quota, so a retry is never blocked.
 */
export async function sendReminders(input: { eventId: string; mode: ReminderMode; actorUid: string; deps: SendDeps }): Promise<SendOutcome> {
  const { deps } = input;
  const blocker = sendingBlocker(deps.config, isMailConfigured());
  if (blocker) return fail(409, blocker);
  const footer = footerFromEnv();
  if (!footer) return fail(409, "Reminders need the organization's name and postal address in the footer. Ask whoever manages the website to add them.");

  const preview = await previewReminders({ eventId: input.eventId, mode: input.mode, now: deps.now, config: deps.config });
  if (!preview.ok) return preview;
  const { plan, event } = preview;
  if (plan.recipients.length === 0) return { ok: true, emailed: 0, failed: 0, skippedAtSend: 0, plan };

  const claimId = crypto.randomUUID();
  const day = quotaDay(deps.now);
  const claimed = await db().runTransaction(async tx => {
    const [memberSnaps, reminderSnaps, quota] = await Promise.all([
      tx.getAll(...plan.recipients.map(r => membersCol().doc(r.memberId))),
      tx.getAll(...plan.recipients.map(r => reminderRef(input.eventId, r.memberId))),
      tx.get(quotaRef(day))
    ]);
    const keep: { recipient: (typeof plan.recipients)[number]; to: string }[] = [];
    plan.recipients.forEach((recipient, index) => {
      const member = memberSnaps[index];
      const reminder = reminderSnaps[index];
      if (!member.exists || memberEmailState(member.data() ?? {}) !== "ready") return;
      const lastSent = toDate(reminder.get("lastSentAt"));
      const claimedAt = toDate(reminder.get("claimedAt"));
      if (lastSent && deps.now.getTime() - lastSent.getTime() < REMINDER_COOLDOWN_MS) return;
      if (claimedAt && deps.now.getTime() - claimedAt.getTime() < CLAIM_IN_FLIGHT_MS) return;
      keep.push({ recipient, to: String(member.get("email") || member.get("emailLower")) });
    });
    const left = deps.config.dailyLimit - Number(quota.get("sent") ?? 0);
    if (keep.length > left) return { error: `Today's sending limit would be passed: ${Math.max(0, left)} ${left === 1 ? "email is" : "emails are"} left today and ${keep.length} are needed. Try again tomorrow, or remind fewer people.` };
    if (keep.length === 0) return { keep };
    for (const { recipient } of keep) {
      tx.set(reminderRef(input.eventId, recipient.memberId), { eventId: input.eventId, memberId: recipient.memberId, claimId, claimedAt: deps.now }, { merge: true });
    }
    tx.set(quotaRef(day), { sent: FieldValue.increment(keep.length), day }, { merge: true });
    return { keep };
  });
  if ("error" in claimed) return fail(409, claimed.error ?? "");
  const { keep } = claimed;
  const skippedAtSend = plan.recipients.length - keep.length;
  if (keep.length === 0) return { ok: true, emailed: 0, failed: 0, skippedAtSend, plan };

  const messages: BatchMessage[] = keep.map(({ recipient, to }) => {
    const mail = reminderEmail({ eventTitle: event.title, eventDay: event.day, recipientName: recipient.name, lines: recipient.lines });
    const token = signUnsubscribeToken(recipient.memberId, deps.serverKeys);
    return { to, subject: mail.subject, text: withUnsubscribeFooter(mail.text, { origin: deps.origin, token, footer }), headers: unsubscribeHeaders(deps.origin, token) };
  });
  const result = await deps.sendBatch(messages, `ghmo-reminder-${input.eventId}-${claimId}`);

  const write = db().batch();
  if (result.ok) {
    for (const { recipient } of keep) {
      write.set(
        reminderRef(input.eventId, recipient.memberId),
        { lastSentAt: deps.now, lastSentBy: input.actorUid, count: FieldValue.increment(1), claimId: FieldValue.delete(), claimedAt: FieldValue.delete() },
        { merge: true }
      );
    }
    await write.commit();
    return { ok: true, emailed: keep.length, failed: 0, skippedAtSend, plan };
  }
  for (const { recipient } of keep) {
    write.set(reminderRef(input.eventId, recipient.memberId), { claimId: FieldValue.delete(), claimedAt: FieldValue.delete() }, { merge: true });
  }
  write.set(quotaRef(day), { sent: FieldValue.increment(-keep.length) }, { merge: true });
  await write.commit();
  return { ok: true, emailed: 0, failed: keep.length, skippedAtSend, plan };
}
