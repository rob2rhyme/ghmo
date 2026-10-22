/**
 * Encrypted record layout for Plans & Issues (plan Phase 4).
 *
 * Private fields (inside an `enc` envelope when encryption is on):
 *   thread    {title, body}            at commsThreads/{id}
 *   conclusion{text}                   at commsThreads/{id}  (field `conclusion.enc`)
 *   comment   {body}                   at commsThreads/{id}/comments/{commentId}
 *   vote      {value}                  at commsThreads/{id}/conclusionVotes/{uid}
 * Public metadata (needed by security rules and lists): status, priority, pinned, timestamps,
 * authors, comment counts, and which admin voted (the vote's document ID).
 *
 * Each envelope is bound to its own location. The conclusion lives in the thread document,
 * so it uses a distinct pseudo document ID (`{id}#conclusion`); otherwise a server could
 * swap the thread's and the conclusion's ciphertexts.
 */
import type { RecordLocation } from "./e2ee";
import type { RecordState, Unpacked } from "./e2ee/client/E2eeProvider";
import type { CommsComment, CommsConclusionVoteValue, CommsThread } from "./comms";

export const THREADS_PATH = "organizations/ghmo/commsThreads";

export const threadLoc = (threadId: string): RecordLocation => ({ path: THREADS_PATH, docId: threadId });
export const conclusionLoc = (threadId: string): RecordLocation => ({ path: THREADS_PATH, docId: `${threadId}#conclusion` });
export const commentLoc = (threadId: string, commentId: string): RecordLocation => ({
  path: `${THREADS_PATH}/${threadId}/comments`,
  docId: commentId
});
export const voteLoc = (threadId: string, uid: string): RecordLocation => ({
  path: `${THREADS_PATH}/${threadId}/conclusionVotes`,
  docId: uid
});

export type Unpack = <T extends Record<string, unknown>>(raw: Record<string, unknown>, location: RecordLocation) => Promise<Unpacked<T>>;

export const UNREADABLE = "Can't be decrypted on this device";

type Flagged = { _e2ee?: RecordState };
export type ThreadView = CommsThread & Flagged;
export type CommentView = CommsComment & Flagged;

function strip<T extends Record<string, unknown>>(value: Unpacked<T>): { fields: Omit<T, "_e2ee" | "_e2eeError">; state: RecordState } {
  const { _e2ee, _e2eeError: _ignored, ...fields } = value as Record<string, unknown>;
  void _ignored;
  return { fields: fields as Omit<T, "_e2ee" | "_e2eeError">, state: _e2ee as RecordState };
}

export async function unpackThread(unpack: Unpack, threadId: string, data: Record<string, unknown>): Promise<ThreadView> {
  const { fields, state } = strip(await unpack<Record<string, unknown>>(data, threadLoc(threadId)));
  let conclusion = fields.conclusion as Record<string, unknown> | undefined;
  let overall: RecordState = state;
  if (conclusion && conclusion.enc !== undefined) {
    const unpacked = strip(await unpack<{ text?: string }>(conclusion, conclusionLoc(threadId)));
    conclusion = unpacked.fields as Record<string, unknown>;
    if (unpacked.state === "failed") overall = "failed";
    else if (overall === "legacy") overall = "encrypted";
  }
  const failed = overall === "failed";
  return {
    ...(fields as Omit<CommsThread, "id">),
    id: threadId,
    title: failed ? UNREADABLE : String(fields.title ?? ""),
    body: failed ? "" : String(fields.body ?? ""),
    conclusion: conclusion as CommsThread["conclusion"],
    _e2ee: overall
  };
}

export async function unpackComment(unpack: Unpack, threadId: string, commentId: string, data: Record<string, unknown>): Promise<CommentView> {
  const { fields, state } = strip(await unpack<{ body?: string }>(data, commentLoc(threadId, commentId)));
  return {
    ...(fields as Omit<CommsComment, "id">),
    id: commentId,
    body: state === "failed" ? UNREADABLE : String(fields.body ?? ""),
    _e2ee: state
  };
}

/** Value of a stored vote, or null if it can't be read. */
export async function unpackVote(unpack: Unpack, threadId: string, uid: string, data: Record<string, unknown>): Promise<CommsConclusionVoteValue | null> {
  const { fields, state } = strip(await unpack<{ value?: CommsConclusionVoteValue }>(data, voteLoc(threadId, uid)));
  if (state === "failed") return null;
  return fields.value === "approve" || fields.value === "reject" ? fields.value : null;
}
