/**
 * Encrypted record layout for meeting minutes (plan Phase 4).
 *
 *   organizations/ghmo/minutes/{id}
 *     public metadata  eventId, eventTitle, eventDate, meetingType, status, recordedBy, timestamps, submitted/approved-by uids
 *     enc              envelope of {chairedBy, agenda, discussionSummary, decisions, actionItems, attendance, signatures}
 *     approvalEnc      envelope of {approvalNotes}   (location id `{id}#approval`)
 *     published        plaintext copy of the content, written by the server only when minutes are approved
 *                      (approved minutes are public by design); removed again on return to draft.
 *
 * Draft and submitted minutes therefore exist only as ciphertext.
 */
import type { RecordLocation } from "./e2ee";
import type { RecordState, Unpacked } from "./e2ee/client/E2eeProvider";
import type { MeetingMinutesRecord } from "./minutes";

export const MINUTES_PATH = "organizations/ghmo/minutes";

export const CONTENT_FIELDS = ["chairedBy", "agenda", "discussionSummary", "decisions", "actionItems", "attendance", "signatures"] as const;

export const minutesLoc = (id: string): RecordLocation => ({ path: MINUTES_PATH, docId: id });
export const approvalLoc = (id: string): RecordLocation => ({ path: MINUTES_PATH, docId: `${id}#approval` });

type Doc = Record<string, unknown>;

/** Server view for admins: published content is merged in so lists work without decrypting; arrays always exist. */
export function adminView(doc: Doc): Doc {
  const { published, ...rest } = doc;
  const merged = { ...rest, ...(published && typeof published === "object" ? (published as Doc) : {}) };
  return withDefaults({ ...merged, encrypted: Boolean(doc.enc) });
}

/** What the public may see: approved minutes only, never ciphertext, notes or admin identities. */
export function publicView(doc: Doc): Doc {
  const { enc, approvalEnc, approvalNotes, submittedByUid, approvedByUid, published, ...rest } = doc;
  void enc; void approvalEnc; void approvalNotes; void submittedByUid; void approvedByUid;
  return withDefaults({ ...rest, ...(published && typeof published === "object" ? (published as Doc) : {}) });
}

/** Everything except content and ciphertext, for audit logs. */
export function auditView(doc: Doc): Doc {
  const out: Doc = { ...doc };
  for (const key of [...CONTENT_FIELDS, "enc", "approvalEnc", "approvalNotes", "published"]) delete out[key];
  return out;
}

function withDefaults(doc: Doc): Doc {
  return { ...doc, agenda: doc.agenda ?? [], decisions: doc.decisions ?? [], actionItems: doc.actionItems ?? [] };
}

export type MinutesUnpack = <T extends Record<string, unknown>>(raw: Record<string, unknown>, location: RecordLocation) => Promise<Unpacked<T>>;

function strip<T extends Record<string, unknown>>(value: Unpacked<T>): { fields: Record<string, unknown>; state: RecordState } {
  const { _e2ee, _e2eeError, ...fields } = value as Record<string, unknown>;
  void _e2eeError;
  return { fields, state: _e2ee as RecordState };
}

/** Decrypt a minutes record from the admin API into the shape the editor and lists use. */
export async function unpackMinutes(unpack: MinutesUnpack, raw: MeetingMinutesRecord): Promise<MeetingMinutesRecord> {
  const record = raw as unknown as Doc;
  if (!record.enc) return { ...raw, _e2ee: "legacy" };
  const { fields, state } = strip(await unpack<Doc>({ enc: record.enc }, minutesLoc(raw.id)));
  let approvalNotes = raw.approvalNotes;
  let overall = state;
  if (record.approvalEnc) {
    const notes = strip(await unpack<{ approvalNotes?: string }>({ enc: record.approvalEnc }, approvalLoc(raw.id)));
    if (notes.state === "failed") overall = "failed";
    else approvalNotes = notes.fields.approvalNotes as string | undefined;
  }
  if (overall === "failed") return { ...raw, agenda: [], decisions: [], actionItems: [], _e2ee: "failed" };
  return {
    ...raw,
    ...(fields as Partial<MeetingMinutesRecord>),
    agenda: (fields.agenda as string[] | undefined) ?? [],
    decisions: (fields.decisions as string[] | undefined) ?? [],
    actionItems: (fields.actionItems as MeetingMinutesRecord["actionItems"] | undefined) ?? [],
    approvalNotes,
    _e2ee: "encrypted"
  };
}
