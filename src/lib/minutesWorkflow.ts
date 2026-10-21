/**
 * Rules for moving meeting minutes through draft → submitted → approved (and back).
 * Pure: the route supplies the stored record and gets back the changes to write, or a refusal.
 *
 *  - The approver can't be the person who submitted.
 *  - Approval is bound to the content that was submitted (hash), so it can't change in the same request.
 *  - Editing submitted minutes returns them to draft.
 *  - Approved minutes can't be edited; reopening needs a written reason and is audited.
 *  - Every approval keeps an immutable version.
 */
import { hashContent, normalizeContent } from "./minutesContent";

type Record_ = Record<string, any>;

export type WorkflowInput = {
  before: Record_;
  action?: "submit" | "approve" | "returnToDraft";
  /** True when the request changes the minutes' content. */
  editsContent: boolean;
  actorUid: string;
  now: Date;
  /** Sentinel the caller uses to delete a field (Firestore's FieldValue.delete()). */
  deleteField: unknown;
  /** Hash of the content being submitted (required for encrypted minutes). */
  contentHash?: string;
  /** Plaintext copy supplied with an approval of encrypted minutes. */
  published?: Record_;
  approvalEnc?: unknown;
  approvalNotes?: string;
  reason?: string;
};

export type WorkflowResult =
  | { ok: true; updates: Record_; version?: Record_; audit: string }
  | { ok: false; status: number; error: string; code?: string };

const refuse = (status: number, error: string, code?: string): WorkflowResult => ({ ok: false, status, error, code });

const CONTENT_FIELDS = ["chairedBy", "agenda", "discussionSummary", "decisions", "actionItems", "attendance", "signatures"];

export async function planTransition(input: WorkflowInput): Promise<WorkflowResult> {
  const { before, action, actorUid, now, deleteField } = input;
  const status = before.status ?? "draft";
  const updates: Record_ = {};

  if (!action) {
    if (status === "approved") return refuse(403, "Cannot edit approved minutes");
    if (input.editsContent && status === "submitted") {
      // Anything approved must be exactly what was submitted, so an edit starts the process again.
      Object.assign(updates, { status: "draft", submittedAt: null, submittedByUid: null, submittedHash: deleteField });
    }
    return { ok: true, updates, audit: "minutes_updated" };
  }
  if (input.editsContent) return refuse(400, "Save the content and change the status in separate steps.");

  switch (action) {
    case "submit": {
      if (status !== "draft") return refuse(400, "Action not allowed");
      let hash = input.contentHash;
      if (before.enc) {
        if (!hash) return refuse(400, "Submitting encrypted minutes needs a content hash.", "CONTENT_HASH_REQUIRED");
      } else {
        hash = await hashContent(before);
      }
      Object.assign(updates, {
        status: "submitted",
        submittedAt: now,
        submittedByUid: actorUid,
        submittedHash: hash,
        approvedAt: null,
        approvedByUid: null,
        approvalNotes: null
      });
      return { ok: true, updates, audit: "minutes_submitted" };
    }

    case "approve": {
      if (status !== "submitted") return refuse(400, "Action not allowed");
      if (before.submittedByUid === actorUid) {
        return refuse(403, "You submitted these minutes, so someone else must approve them.", "SEPARATION_OF_DUTIES");
      }
      let content;
      if (before.enc) {
        if (!input.published) return refuse(400, "Approving encrypted minutes needs the content to publish.");
        content = normalizeContent(input.published);
      } else {
        content = normalizeContent(before);
      }
      const hash = await hashContent(content as Record_);
      if (before.submittedHash && hash !== before.submittedHash) {
        return refuse(409, "The content differs from what was submitted. Return the minutes to draft and submit again.", "CONTENT_CHANGED");
      }
      const version = (before.version ?? 0) + 1;
      Object.assign(updates, {
        status: "approved",
        approvedAt: now,
        approvedByUid: actorUid,
        version,
        contentHash: hash,
        ...(before.enc ? { published: content } : {}),
        ...(input.approvalEnc ? { approvalEnc: input.approvalEnc } : {}),
        ...(input.approvalNotes !== undefined ? { approvalNotes: input.approvalNotes.trim() || null } : {})
      });
      return {
        ok: true,
        updates,
        audit: "minutes_approved",
        version: {
          version,
          contentHash: hash,
          approvedAt: now,
          approvedByUid: actorUid,
          submittedByUid: before.submittedByUid ?? null,
          submittedAt: before.submittedAt ?? null,
          published: content,
          ...(input.approvalEnc ? { approvalEnc: input.approvalEnc } : {})
        }
      };
    }

    case "returnToDraft": {
      if (status === "draft") return refuse(400, "Action not allowed");
      const wasApproved = status === "approved";
      const reason = input.reason?.trim();
      if (wasApproved && (!reason || reason.length < 10)) {
        return refuse(400, "Say why you are reopening approved minutes (at least 10 characters).", "REASON_REQUIRED");
      }
      Object.assign(updates, {
        status: "draft",
        submittedAt: null,
        submittedByUid: null,
        submittedHash: deleteField,
        approvedAt: null,
        approvedByUid: null,
        approvalNotes: null,
        published: deleteField,
        approvalEnc: deleteField,
        ...(wasApproved ? { reopenedAt: now, reopenedByUid: actorUid, reopenReason: reason } : {})
      });
      return { ok: true, updates, audit: wasApproved ? "minutes_reopened" : "minutes_returned_to_draft" };
    }
  }
}

export const MINUTES_CONTENT_FIELDS = CONTENT_FIELDS;
