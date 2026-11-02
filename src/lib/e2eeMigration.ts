/**
 * One-time migration of records written before encryption was turned on (plan Phase 4).
 *
 * The browser does the work: it fetches legacy records, encrypts each one on an unlocked device,
 * checks that the envelope decrypts back to exactly the original, and only then asks the server
 * to swap the plaintext for the envelope. The server never sees the key, and refuses the swap if
 * the record changed in the meantime.
 */
import type { RecordLocation } from "./e2ee";
import { actionStatusLoc } from "./actionItems";
import { documentLoc } from "./documentRecords";
import { CONTENT_FIELDS, minutesLoc } from "./minutesRecords";
import { commentLoc, conclusionLoc, threadLoc, voteLoc } from "./commsRecords";
import { MINUTES_PATH } from "./minutesRecords";

export const MIGRATION_AREAS = ["chat", "threads", "conclusions", "comments", "votes", "minutes", "documents", "actionStatus"] as const;
export type MigrationArea = (typeof MIGRATION_AREAS)[number];

/** How each area reads on the Encryption page (display only). */
export const AREA_LABELS: Record<MigrationArea, string> = {
  chat: "Admin chat messages",
  threads: "Plans & Issues topics",
  conclusions: "Topic conclusions",
  comments: "Topic comments",
  votes: "Votes on conclusions",
  minutes: "Draft and submitted minutes",
  documents: "Document gallery",
  actionStatus: "Action item progress"
};

export type MigrationItem = {
  area: MigrationArea;
  id: string;
  /** Parent thread for comments, conclusions and votes. */
  parentId?: string;
  /** Firestore update time, echoed back so the server can refuse if the record changed. */
  updateTime: string;
  /** The plaintext fields to encrypt. */
  plain: Record<string, unknown>;
};

/** Plaintext fields of a record that still need encrypting, or null if there is nothing to do. */
export function plainFields(area: MigrationArea, data: Record<string, unknown>): Record<string, unknown> | null {
  if (data.enc !== undefined && area !== "conclusions") {
    // Already encrypted: only leftovers from before (e.g. a document with both) would remain.
    return null;
  }
  const pick = (keys: readonly string[], source: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const key of keys) if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
    return Object.keys(out).length ? out : null;
  };
  switch (area) {
    case "chat":
      return typeof data.body === "string" ? { body: data.body } : null;
    case "threads":
      return typeof data.title === "string" || typeof data.body === "string" ? pick(["title", "body"], data) : null;
    case "conclusions": {
      const conclusion = data.conclusion as Record<string, unknown> | undefined;
      return conclusion && typeof conclusion.text === "string" && conclusion.enc === undefined ? { text: conclusion.text } : null;
    }
    case "comments":
      return typeof data.body === "string" ? { body: data.body } : null;
    case "votes":
      return data.value === "approve" || data.value === "reject" ? { value: data.value } : null;
    case "minutes":
      // Approved minutes are public by design and keep their plaintext.
      return data.status === "approved" ? null : pick([...CONTENT_FIELDS], data);
    case "documents":
      return pick(["inputs", "pdfBase64"], data);
    case "actionStatus":
      return data.status === "open" || data.status === "done" || data.status === "dropped" ? pick(["status", "note"], data) : null;
  }
}

export function locationFor(area: MigrationArea, id: string, parentId?: string): RecordLocation {
  switch (area) {
    case "chat":
      return { path: "organizations/ghmo/adminChatMessages", docId: id };
    case "threads":
      return threadLoc(id);
    case "conclusions":
      return conclusionLoc(id);
    case "comments":
      return commentLoc(parentId ?? "", id);
    case "votes":
      return voteLoc(parentId ?? "", id);
    case "minutes":
      return minutesLoc(id);
    case "documents":
      return documentLoc(id);
    case "actionStatus":
      return actionStatusLoc(id);
  }
}

/** Fields to remove once the envelope is stored (dotted paths for nested ones). */
export function plaintextFieldsToDelete(area: MigrationArea): string[] {
  switch (area) {
    case "chat":
    case "comments":
      return ["body"];
    case "threads":
      return ["title", "body"];
    case "conclusions":
      return ["conclusion.text"];
    case "votes":
      return ["value"];
    case "minutes":
      return [...CONTENT_FIELDS, "approvalNotes"];
    case "documents":
      return ["inputs", "pdfBase64"];
    case "actionStatus":
      return ["status", "note"];
  }
}

/** Field that receives the envelope. */
export const envelopeField = (area: MigrationArea) => (area === "conclusions" ? "conclusion.enc" : "enc");

export { MINUTES_PATH };
