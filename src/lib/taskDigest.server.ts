import "server-only";

import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { footerFromEnv, unsubscribeHeaders, withUnsubscribeFooter } from "./broadcastMail";
import { quotaDay, type SendingConfig } from "./broadcastSending";
import { sendingBlocker } from "./broadcastSender.server";
import { COMMUNITY_SLUG } from "./community";
import { listOpenTasks } from "./eventTasks.server";
import { eventDay } from "./eventTasks";
import { normalizeEvent, queryAllEvents } from "./events";
import { toDate } from "./format";
import { getAdminDb } from "./firebaseAdmin";
import { orgDocPath, orgEventTaskRemindersCollectionPath, orgGroupsCollectionPath, orgMembersCollectionPath, orgTaskDigestCollectionPath } from "./firestorePaths";
import { isMailConfigured, type BatchMessage, type BatchResult } from "./mailer.server";
import { memberEmailState } from "./members";
import { POSITION_TIME_ZONE, todayIn } from "./positions";
import { CLAIM_IN_FLIGHT_MS, DIGEST_COOLDOWN_MS, digestCap, digestEmail, planDigest, type DigestPlan, type ReminderHistory } from "./taskReminders";
import { readMembers } from "./taskReminders.server";
import { signUnsubscribeToken } from "./unsubscribeToken";

/**
 * The automatic daily digest of overdue tasks (plan §16, 12-B). It is off until a super admin switches it on, runs
 * at most once a day (a claim on the settings document), uses the same consent rules, footer and unsubscribe link as
 * manual reminders, and takes at most half of the day's shared email limit so broadcasts keep room.
 *
 *  organizations/ghmo/taskDigest/settings   enabled, updatedAt, updatedBy, lastRunDay, runningSince, lastRun{…}
 *  organizations/ghmo/eventTaskReminders/digest~{memberId}   kind "digest", lastSentAt, claimId, claimedAt, count
 */
const db = () => getAdminDb();
const settingsRef = () => db().doc(`${orgTaskDigestCollectionPath(COMMUNITY_SLUG)}/settings`);
const remindersCol = () => db().collection(orgEventTaskRemindersCollectionPath(COMMUNITY_SLUG));
const digestRef = (memberId: string) => remindersCol().doc(`digest~${memberId}`);
const membersCol = () => db().collection(orgMembersCollectionPath(COMMUNITY_SLUG));
const quotaRef = (day: string) => db().doc(`${orgDocPath(COMMUNITY_SLUG)}/broadcastQuota/${day}`);

/** A run that started less than this long ago is still going; another one waits. */
const RUN_IN_PROGRESS_MS = 10 * 60 * 1000;

export type DigestRunSummary = {
  at: string;
  day: string;
  status: "sent" | "nothing_to_send" | "blocked" | "failed";
  emailed: number;
  failed: number;
  deferred: number;
  cannotEmail: number;
  unassigned: number;
  note: string | null;
};

export type DigestSettings = { enabled: boolean; updatedAt: string | null; updatedBy: string | null; lastRun: DigestRunSummary | null };

function mapSummary(value: unknown): DigestRunSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const at = toDate(data.at as never);
  return {
    at: at ? at.toISOString() : "",
    day: String(data.day ?? ""),
    status: (["sent", "nothing_to_send", "blocked", "failed"] as const).find(status => status === data.status) ?? "failed",
    emailed: Number(data.emailed ?? 0),
    failed: Number(data.failed ?? 0),
    deferred: Number(data.deferred ?? 0),
    cannotEmail: Number(data.cannotEmail ?? 0),
    unassigned: Number(data.unassigned ?? 0),
    note: typeof data.note === "string" ? data.note : null
  };
}

export async function readDigestSettings(): Promise<DigestSettings> {
  const data = (await settingsRef().get()).data() ?? {};
  const updatedAt = toDate(data.updatedAt as never);
  return { enabled: data.enabled === true, updatedAt: updatedAt ? updatedAt.toISOString() : null, updatedBy: (data.updatedBy as string | undefined) ?? null, lastRun: mapSummary(data.lastRun) };
}

export async function setDigestEnabled(enabled: boolean, actorUid: string, now: Date = new Date()): Promise<DigestSettings & { before: boolean }> {
  const before = (await readDigestSettings()).enabled;
  await settingsRef().set({ enabled, updatedAt: now, updatedBy: actorUid }, { merge: true });
  return { ...(await readDigestSettings()), before };
}

export type DigestDeps = {
  config: SendingConfig;
  origin: string;
  now: Date;
  serverKeys: Uint8Array[];
  sendBatch: (messages: BatchMessage[], idempotencyKey: string) => Promise<BatchResult>;
};

export type DigestRunResult =
  | { ran: false; reason: "off" | "already_ran" | "in_progress" }
  | { ran: true; summary: DigestRunSummary };

async function claimRun(day: string, now: Date): Promise<"ok" | "already_ran" | "in_progress"> {
  return db().runTransaction(async tx => {
    const snap = await tx.get(settingsRef());
    if (snap.get("lastRunDay") === day) return "already_ran" as const;
    const since = toDate(snap.get("runningSince"));
    if (since && now.getTime() - since.getTime() < RUN_IN_PROGRESS_MS) return "in_progress" as const;
    tx.set(settingsRef(), { runningSince: now }, { merge: true });
    return "ok" as const;
  });
}

async function finishRun(summary: Omit<DigestRunSummary, "at">, now: Date, countsAsDone: boolean) {
  await settingsRef().set(
    { lastRun: { ...summary, at: now }, runningSince: FieldValue.delete(), ...(countsAsDone ? { lastRunDay: summary.day } : {}) },
    { merge: true }
  );
}

/** Loads everything the plan needs and returns who would get today's digest, without changing anything. */
async function buildPlan(deps: DigestDeps, day: string): Promise<{ plan: DigestPlan; sentToday: number }> {
  const eventDocs = await queryAllEvents(db());
  const events = eventDocs.map(doc => {
    const event = normalizeEvent(doc);
    const startsAt = toDate(event.startsAt)?.getTime() ?? null;
    return { id: event.id, title: event.title, day: eventDay(startsAt, event.timezone || "America/New_York") };
  });
  const tasks = await listOpenTasks();
  const groupSnaps = await db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG)).get();
  const groups = groupSnaps.docs.map(doc => ({ id: doc.id, leadMemberId: (doc.get("leadMemberId") as string | null) || null }));
  const ownerIds = [...new Set(tasks.flatMap(task => [...task.memberIds, ...(groups.find(g => g.id === task.groupId)?.leadMemberId ? [groups.find(g => g.id === task.groupId)!.leadMemberId as string] : [])]))];
  const [members, historySnap, quota] = await Promise.all([readMembers(ownerIds), remindersCol().where("kind", "==", "digest").get(), quotaRef(quotaDay(deps.now)).get()]);
  const history = new Map<string, ReminderHistory>(historySnap.docs.map(doc => [doc.get("memberId") as string, { lastSentAt: toDate(doc.get("lastSentAt")), claimedAt: toDate(doc.get("claimedAt")) }]));
  const sentToday = Number(quota.get("sent") ?? 0);
  const plan = planDigest({ events, tasks, groups, members, history, today: day, now: deps.now, cap: digestCap({ dailyLimit: deps.config.dailyLimit, sentToday }) });
  return { plan, sentToday };
}

/** Today's digest, run by the schedule. Does nothing unless the switch is on, and at most once a day. */
export async function runTaskDigest(deps: DigestDeps): Promise<DigestRunResult> {
  const settings = await readDigestSettings();
  if (!settings.enabled) return { ran: false, reason: "off" };
  const day = todayIn(deps.now, POSITION_TIME_ZONE);
  const base = { day, emailed: 0, failed: 0, deferred: 0, cannotEmail: 0, unassigned: 0, note: null as string | null };

  const claim = await claimRun(day, deps.now);
  if (claim !== "ok") return { ran: false, reason: claim };

  const blocker = sendingBlocker(deps.config, isMailConfigured());
  const footer = footerFromEnv();
  if (blocker || !footer) {
    const summary = { ...base, status: "blocked" as const, note: blocker ?? "Reminders need the organization's name and postal address in the footer." };
    await finishRun(summary, deps.now, false);
    return { ran: true, summary: { ...summary, at: deps.now.toISOString() } };
  }

  try {
    const { plan } = await buildPlan(deps, day);
    const counts = { cannotEmail: plan.cannotEmail, unassigned: plan.unassigned, deferred: plan.deferred };
    if (plan.recipients.length === 0) {
      const summary = { ...base, ...counts, status: "nothing_to_send" as const };
      await finishRun(summary, deps.now, true);
      return { ran: true, summary: { ...summary, at: deps.now.toISOString() } };
    }

    // Claim the people, re-reading consent, the per-person digest record and the quota in one transaction.
    const claimId = crypto.randomUUID();
    const qDay = quotaDay(deps.now);
    const claimed = await db().runTransaction(async tx => {
      const [memberSnaps, recordSnaps, quota] = await Promise.all([
        tx.getAll(...plan.recipients.map(r => membersCol().doc(r.memberId))),
        tx.getAll(...plan.recipients.map(r => digestRef(r.memberId))),
        tx.get(quotaRef(qDay))
      ]);
      const room = digestCap({ dailyLimit: deps.config.dailyLimit, sentToday: Number(quota.get("sent") ?? 0) });
      const keep: { recipient: (typeof plan.recipients)[number]; to: string }[] = [];
      plan.recipients.forEach((recipient, index) => {
        if (keep.length >= room) return;
        const member = memberSnaps[index];
        const record = recordSnaps[index];
        if (!member.exists || memberEmailState(member.data() ?? {}) !== "ready") return;
        const lastSent = toDate(record.get("lastSentAt"));
        const claimedAt = toDate(record.get("claimedAt"));
        if (lastSent && deps.now.getTime() - lastSent.getTime() < DIGEST_COOLDOWN_MS) return;
        if (claimedAt && deps.now.getTime() - claimedAt.getTime() < CLAIM_IN_FLIGHT_MS) return;
        keep.push({ recipient, to: String(member.get("email") || member.get("emailLower")) });
      });
      if (keep.length === 0) return keep;
      for (const { recipient } of keep) tx.set(digestRef(recipient.memberId), { kind: "digest", memberId: recipient.memberId, claimId, claimedAt: deps.now }, { merge: true });
      tx.set(quotaRef(qDay), { sent: FieldValue.increment(keep.length), day: qDay }, { merge: true });
      return keep;
    });
    const deferred = plan.deferred + (plan.recipients.length - claimed.length);
    if (claimed.length === 0) {
      const summary = { ...base, ...counts, deferred, status: "nothing_to_send" as const };
      await finishRun(summary, deps.now, true);
      return { ran: true, summary: { ...summary, at: deps.now.toISOString() } };
    }

    const messages: BatchMessage[] = claimed.map(({ recipient, to }) => {
      const mail = digestEmail({ recipientName: recipient.name, sections: recipient.sections });
      const token = signUnsubscribeToken(recipient.memberId, deps.serverKeys);
      return { to, subject: mail.subject, text: withUnsubscribeFooter(mail.text, { origin: deps.origin, token, footer }), headers: unsubscribeHeaders(deps.origin, token) };
    });
    const result = await deps.sendBatch(messages, `ghmo-digest-${day}-${claimId}`);
    const write = db().batch();
    if (result.ok) {
      for (const { recipient } of claimed) {
        write.set(digestRef(recipient.memberId), { lastSentAt: deps.now, count: FieldValue.increment(1), claimId: FieldValue.delete(), claimedAt: FieldValue.delete() }, { merge: true });
      }
      await write.commit();
      const summary = { ...base, ...counts, deferred, emailed: claimed.length, status: "sent" as const };
      await finishRun(summary, deps.now, true);
      return { ran: true, summary: { ...summary, at: deps.now.toISOString() } };
    }
    for (const { recipient } of claimed) write.set(digestRef(recipient.memberId), { claimId: FieldValue.delete(), claimedAt: FieldValue.delete() }, { merge: true });
    write.set(quotaRef(qDay), { sent: FieldValue.increment(-claimed.length) }, { merge: true });
    await write.commit();
    // Not counted as done, so a second try the same day is allowed.
    const summary = { ...base, ...counts, deferred, failed: claimed.length, status: "failed" as const, note: "The email service didn't accept the digest. Nothing was recorded as sent." };
    await finishRun(summary, deps.now, false);
    return { ran: true, summary: { ...summary, at: deps.now.toISOString() } };
  } catch (error) {
    await finishRun({ ...base, status: "failed", note: "The digest stopped because of an error." }, deps.now, false).catch(() => undefined);
    throw error;
  }
}

