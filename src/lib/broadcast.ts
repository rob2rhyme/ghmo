import crypto from "node:crypto";
import { memberEmailState } from "./members";

/**
 * Broadcast emails to members (plan §10). Pure rules: the routes load the stored record and get back
 * the changes to write, or a refusal. Statuses in this step: draft → pending_approval → approved,
 * and cancelled from any of them. (Sending, 8-D, adds sending → sent.)
 *
 *  - A second admin must approve: nobody who wrote or submitted a broadcast can approve it.
 *  - Approval is bound to the exact subject and body (hash): the approver sends the hash they were
 *    shown, and it must match what is stored.
 *  - Editing a submitted or approved broadcast sends it back to draft, so what goes out is always
 *    exactly what was approved.
 */
export type BroadcastStatus = "draft" | "pending_approval" | "approved" | "cancelled";

export const SUBJECT_MAX = 150;
export const BODY_MAX = 20_000;

export type BroadcastContent = { subject: string; body: string };

export function normalizeBroadcastContent(input: { subject?: unknown; body?: unknown }): { ok: true; content: BroadcastContent } | { ok: false; error: string } {
  const subject = typeof input.subject === "string" ? input.subject.replace(/\s+/g, " ").trim() : "";
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (!subject) return { ok: false, error: "Add a subject." };
  if (subject.length > SUBJECT_MAX) return { ok: false, error: `The subject is longer than ${SUBJECT_MAX} characters.` };
  if (!body) return { ok: false, error: "Write the message." };
  if (body.length > BODY_MAX) return { ok: false, error: `The message is longer than ${BODY_MAX.toLocaleString("en-US")} characters.` };
  return { ok: true, content: { subject, body } };
}

/** The audience is everyone who can be emailed; roles are not offered yet (members only have the "member" role). */
export function hashBroadcast(content: BroadcastContent): string {
  return crypto.createHash("sha256").update(JSON.stringify({ v: 1, audience: "all", subject: content.subject, body: content.body })).digest("hex");
}

/** Members who may be emailed right now (active, consent recorded, no opt-out, no bounce). */
export function selectRecipients<T extends Parameters<typeof memberEmailState>[0]>(members: T[]): T[] {
  return members.filter(member => memberEmailState(member) === "ready");
}

type Stored = {
  status?: BroadcastStatus;
  subject?: string;
  body?: string;
  createdByUid?: string;
  submittedByUid?: string | null;
  submittedHash?: string | null;
};

export type BroadcastAction = "submit" | "approve" | "withdraw" | "cancel";

export type BroadcastPlan =
  | { ok: true; updates: Record<string, unknown>; audit: string }
  | { ok: false; status: number; error: string; code?: string };

const refuse = (status: number, error: string, code?: string): BroadcastPlan => ({ ok: false, status, error, code });

const RESET = { submittedAt: null, submittedByUid: null, submittedHash: null, approvedAt: null, approvedByUid: null, approvedHash: null };

/** Saving new content: only drafts keep their status; submitted or approved broadcasts go back to draft. */
export function planContentEdit(before: Stored, content: BroadcastContent, now: Date): BroadcastPlan {
  const status = before.status ?? "draft";
  if (status === "cancelled") return refuse(409, "This broadcast was cancelled.");
  const updates: Record<string, unknown> = { subject: content.subject, body: content.body, contentHash: hashBroadcast(content), updatedAt: now };
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
      if (status === "cancelled") return refuse(400, "Already cancelled.");
      return { ok: true, audit: "broadcast_cancelled", updates: { status: "cancelled", cancelledAt: now, cancelledByUid: actorUid, updatedAt: now } };
    }
  }
}
