import "server-only";

import { memberEmailState } from "./members";
import {
  BODY_MAX,
  MANUAL_CHANNELS,
  SUBJECT_MAX,
  audienceFields,
  readAudience,
  type BroadcastAction,
  type BroadcastAudience,
  type BroadcastContent,
  type BroadcastStatus,
  type ManualChannel
} from "./broadcast.shared";
import { hashBroadcast } from "./broadcastHash";

/**
 * Broadcast emails to members (plan §10). Pure rules: the routes load the stored record and get back
 * the changes to write, or a refusal. Statuses: draft → pending_approval → approved → sending → sent,
 * and cancelled from any status before sent (cancelling while sending stops the remaining chunks).
 *
 *  - A second admin must approve: nobody who wrote or submitted a broadcast can approve it.
 *  - Approval is bound to the exact subject, body and audience (hash): the approver sends the hash they
 *    were shown, and it must match what is stored.
 *  - Editing a submitted or approved broadcast sends it back to draft, so what goes out is always
 *    exactly what was approved.
 */
export type { BroadcastAction, BroadcastAudience, BroadcastContent, BroadcastStatus, ManualChannel } from "./broadcast.shared";
export { AUDIENCE_ALL, BODY_MAX, MANUAL_CHANNELS, MANUAL_CHANNEL_LABELS, SUBJECT_MAX, audienceFields, audienceKey, audienceLabel, messengerText, readAudience } from "./broadcast.shared";
export { hashBroadcast } from "./broadcastHash";

/** Checks subject, body and audience (stored or posted). A missing audience means everyone. */
export function normalizeBroadcastContent(input: { subject?: unknown; body?: unknown; audience?: unknown; audienceGroupId?: unknown }): { ok: true; content: BroadcastContent } | { ok: false; error: string } {
  const subject = typeof input.subject === "string" ? input.subject.replace(/\s+/g, " ").trim() : "";
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (!subject) return { ok: false, error: "Add a subject." };
  if (subject.length > SUBJECT_MAX) return { ok: false, error: `The subject is longer than ${SUBJECT_MAX} characters.` };
  if (!body) return { ok: false, error: "Write the message." };
  if (body.length > BODY_MAX) return { ok: false, error: `The message is longer than ${BODY_MAX.toLocaleString("en-US")} characters.` };
  const audience = readAudience(input);
  if (!audience) return { ok: false, error: "Pick who it goes to: everyone, or one group." };
  return { ok: true, content: { subject, body, audience } };
}

/** Whether a member is in the audience (the group check only; consent is checked separately). */
export function inAudience(member: { groupIds?: unknown }, audience: BroadcastAudience | undefined): boolean {
  if (audience?.kind !== "group") return true;
  return Array.isArray(member.groupIds) && member.groupIds.includes(audience.groupId);
}

/** Members who may be emailed right now (active, consent recorded, no opt-out, no bounce), within the audience. */
export function selectRecipients<T extends Parameters<typeof memberEmailState>[0] & { groupIds?: unknown }>(members: T[], audience?: BroadcastAudience): T[] {
  return members.filter(member => memberEmailState(member) === "ready" && inAudience(member, audience));
}

type Stored = {
  status?: BroadcastStatus;
  subject?: string;
  body?: string;
  audience?: unknown;
  audienceGroupId?: unknown;
  createdByUid?: string;
  submittedByUid?: string | null;
  submittedHash?: string | null;
};

export type BroadcastPlan =
  | { ok: true; updates: Record<string, unknown>; audit: string }
  | { ok: false; status: number; error: string; code?: string };

const refuse = (status: number, error: string, code?: string): BroadcastPlan => ({ ok: false, status, error, code });

const RESET = { submittedAt: null, submittedByUid: null, submittedHash: null, approvedAt: null, approvedByUid: null, approvedHash: null };

/** Saving new content or a new audience: only drafts keep their status; submitted or approved broadcasts go back to draft. */
export function planContentEdit(before: Stored, content: BroadcastContent, now: Date): BroadcastPlan {
  const status = before.status ?? "draft";
  if (status === "cancelled") return refuse(409, "This broadcast was canceled.");
  if (status === "sending" || status === "sent") return refuse(409, "This broadcast is being sent or was sent, so it can't be changed.");
  const updates: Record<string, unknown> = { subject: content.subject, body: content.body, ...audienceFields(content.audience), contentHash: hashBroadcast(content), updatedAt: now };
  if (status !== "draft") Object.assign(updates, { status: "draft", ...RESET });
  return { ok: true, updates, audit: status === "draft" ? "broadcast_updated" : "broadcast_edited_returned_to_draft" };
}

export function planBroadcastTransition(params: { before: Stored; action: BroadcastAction; actorUid: string; now: Date; contentHash?: string }): BroadcastPlan {
  const { before, action, actorUid, now } = params;
  const status = before.status ?? "draft";
  const normalized = normalizeBroadcastContent(before);
  const currentHash = normalized.ok ? hashBroadcast(normalized.content) : undefined;

  switch (action) {
    case "submit": {
      if (status !== "draft") return refuse(400, "Only a draft can be submitted.");
      if (!normalized.ok) return refuse(400, normalized.error);
      return {
        ok: true,
        audit: "broadcast_submitted",
        updates: { status: "pending_approval", submittedAt: now, submittedByUid: actorUid, submittedHash: currentHash, approvedAt: null, approvedByUid: null, approvedHash: null, updatedAt: now }
      };
    }
    case "approve": {
      if (status !== "pending_approval") return refuse(400, "This broadcast is not waiting for approval.");
      if (before.submittedByUid === actorUid || before.createdByUid === actorUid) {
        return refuse(403, "You wrote or submitted this broadcast, so someone else must approve it.", "SEPARATION_OF_DUTIES");
      }
      if (!params.contentHash || params.contentHash !== currentHash || params.contentHash !== before.submittedHash) {
        return refuse(409, "The broadcast changed since you opened it. Reload and read it again before approving.", "CONTENT_CHANGED");
      }
      return { ok: true, audit: "broadcast_approved", updates: { status: "approved", approvedAt: now, approvedByUid: actorUid, approvedHash: currentHash, updatedAt: now } };
    }
    case "withdraw": {
      if (status !== "pending_approval" && status !== "approved") return refuse(400, "Nothing to withdraw.");
      return { ok: true, audit: "broadcast_withdrawn", updates: { status: "draft", ...RESET, updatedAt: now } };
    }
    case "cancel": {
      if (status === "cancelled") return refuse(400, "This broadcast was already canceled.");
      if (status === "sent") return refuse(400, "This broadcast was already sent.");
      return { ok: true, audit: "broadcast_cancelled", updates: { status: "cancelled", cancelledAt: now, cancelledByUid: actorUid, updatedAt: now } };
    }
  }
}

/**
 * Starting to send: only an approved broadcast whose stored text still matches what was approved.
 * The caller (the sender) snapshots the recipients and creates one delivery row per member.
 */
export function planStartSending(before: Stored & { approvedHash?: string | null }, actorUid: string, now: Date): BroadcastPlan {
  if ((before.status ?? "draft") !== "approved") return refuse(400, "Only an approved broadcast can be sent.");
  const normalized = normalizeBroadcastContent(before);
  if (!normalized.ok || !before.approvedHash || hashBroadcast(normalized.content) !== before.approvedHash) {
    return refuse(409, "The text no longer matches what was approved. Withdraw it and get it approved again.", "CONTENT_CHANGED");
  }
  return { ok: true, audit: "broadcast_sending_started", updates: { status: "sending", startedAt: now, startedByUid: actorUid, updatedAt: now } };
}


// ---- Posting an approved broadcast by hand to the Messenger group chats (plan §12, 9-D, decision D14) ----
//
// There is no Messenger integration: an admin copies the approved text and pastes it into the group
// chat themselves. The site only formats the text and records who said they posted it, where and when,
// so the audit trail covers the group chats too. Only approved text can be copied and recorded.

export type ManualPost = { channel: ManualChannel; at: Date; byUid: string; byName: string };

/** Statuses whose text a second admin approved and that nobody changed since. */
const POSTABLE: BroadcastStatus[] = ["approved", "sending", "sent"];

export function planManualPost(params: {
  before: Stored & { approvedHash?: string | null };
  channel: ManualChannel;
  contentHash: string;
  actorUid: string;
  actorName: string;
  now: Date;
}): { ok: true; post: ManualPost } | { ok: false; status: number; error: string; code?: string } {
  const { before } = params;
  if (!POSTABLE.includes(before.status ?? "draft")) return { ok: false, status: 400, error: "Only an approved message can be posted to the group chats." };
  if (!(MANUAL_CHANNELS as readonly string[]).includes(params.channel)) return { ok: false, status: 400, error: "Pick a group chat." };
  const normalized = normalizeBroadcastContent(before);
  const current = normalized.ok ? hashBroadcast(normalized.content) : undefined;
  if (!current || current !== before.approvedHash || params.contentHash !== current) {
    return { ok: false, status: 409, error: "The text changed since you copied it. Reload and copy it again.", code: "CONTENT_CHANGED" };
  }
  return { ok: true, post: { channel: params.channel, at: params.now, byUid: params.actorUid, byName: params.actorName } };
}
