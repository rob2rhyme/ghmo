import type { Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import { listAdmins } from "./admin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "./community";
import { eventsCollectionPath } from "./events";
import { orgDocPath, orgMembersCollectionPath } from "./firestorePaths";
import { memberCallState } from "./members";
import { readAssignments, readTree } from "./callingTree.server";
import {
  EMPTY_COUNTS,
  computeCounts,
  planAttempt,
  type AttemptInput,
  type CallRow,
  type CampaignCounts,
  type CampaignStatus,
  type Outcome,
  type Rsvp
} from "./callCampaigns";
import type { EnvelopeInput } from "./e2eeEnvelope.server";

/**
 * Storage for call campaigns (plan §12.3). Server-written only; the rules deny every client read and
 * write, so attempts are append-only by construction and every one of them is audited by the route.
 *
 *  organizations/ghmo/callCampaigns/{id}             title, eventId, script (envelope), dueAt, status,
 *                                                    createdBy/At, closedBy/At, treeVersion, counts
 *  organizations/ghmo/callCampaigns/{id}/calls/{memberId}  callerUid, outcome, rsvp, attempts[], updatedAt
 */
const campaignsCol = () => getAdminDb().collection(`${orgDocPath(COMMUNITY_SLUG)}/callCampaigns`);
const callsCol = (campaignId: string) => campaignsCol().doc(campaignId).collection("calls");

const toMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) return (value as { toMillis: () => number }).toMillis();
  return null;
};

export type StoredCampaign = {
  id: string;
  title: string;
  eventId: string | null;
  eventTitle: string | null;
  script: unknown;
  dueAt: number | null;
  status: CampaignStatus;
  createdBy: string;
  createdAt: number | null;
  closedBy: string | null;
  closedAt: number | null;
  treeVersion: number;
  counts: CampaignCounts;
};

export type StoredAttempt = { id: string; at: number | null; outcome: Outcome; byUid: string; note?: unknown };
export type StoredCall = CallRow & { attempts: StoredAttempt[]; updatedAt: number | null };

function mapCampaign(id: string, data: Record<string, unknown>): StoredCampaign {
  return {
    id,
    title: (data.title as string) ?? "",
    eventId: (data.eventId as string | undefined) ?? null,
    eventTitle: (data.eventTitle as string | undefined) ?? null,
    script: data.script ?? null,
    dueAt: toMillis(data.dueAt),
    status: data.status === "closed" ? "closed" : "open",
    createdBy: (data.createdBy as string) ?? "",
    createdAt: toMillis(data.createdAt),
    closedBy: (data.closedBy as string | undefined) ?? null,
    closedAt: toMillis(data.closedAt),
    treeVersion: typeof data.treeVersion === "number" ? data.treeVersion : 0,
    counts: { ...EMPTY_COUNTS, ...((data.counts as Partial<CampaignCounts> | undefined) ?? {}) }
  };
}

function mapCall(memberId: string, data: Record<string, unknown>): StoredCall {
  const attempts = Array.isArray(data.attempts) ? (data.attempts as Record<string, unknown>[]) : [];
  return {
    memberId,
    callerUid: (data.callerUid as string) ?? "",
    outcome: (data.outcome as Outcome | null | undefined) ?? null,
    rsvp: (data.rsvp as Rsvp | null | undefined) ?? null,
    attemptCount: attempts.length,
    attempts: attempts.map(a => ({ id: (a.id as string) ?? "", at: toMillis(a.at), outcome: a.outcome as Outcome, byUid: (a.byUid as string) ?? "", ...(a.note ? { note: a.note } : {}) })),
    updatedAt: toMillis(data.updatedAt)
  };
}

export async function listCampaigns(): Promise<StoredCampaign[]> {
  const snap = await campaignsCol().get();
  return snap.docs.map(doc => mapCampaign(doc.id, doc.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function readCampaign(id: string): Promise<StoredCampaign | null> {
  const snap = await campaignsCol().doc(id).get();
  return snap.exists ? mapCampaign(snap.id, snap.data() ?? {}) : null;
}

export async function readCalls(campaignId: string, callerUid?: string): Promise<StoredCall[]> {
  const col = callsCol(campaignId);
  const snap = await (callerUid ? col.where("callerUid", "==", callerUid) : col).get();
  return snap.docs.map(doc => mapCall(doc.id, doc.data()));
}

async function findEventTitle(eventId: string): Promise<string | null> {
  const db = getAdminDb();
  for (const path of [eventsCollectionPath(COMMUNITY_SLUG), eventsCollectionPath(COMMUNITY_ID), `community/${COMMUNITY_ID}/events`]) {
    const snap = await db.collection(path).doc(eventId).get();
    if (snap.exists) return (snap.get("title") as string | undefined) ?? null;
  }
  return null;
}

export type CreateCampaignInput = {
  id: string;
  title: string;
  eventId: string | null;
  script: EnvelopeInput | null;
  dueAt: Date | null;
  actorUid: string;
  now: Date;
};

export type CreateCampaignResult = { ok: true; campaign: StoredCampaign; callers: string[] } | { ok: false; status: number; error: string };

/**
 * Opens a campaign and snapshots the calling tree into it: one call record per callable assigned
 * member. The list is then fixed for the campaign, so a later change to the tree does not move
 * people mid-announcement. One open campaign per event.
 */
export async function createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
  if (!input.title) return { ok: false, status: 400, error: "Give the campaign a title." };
  let eventTitle: string | null = null;
  if (input.eventId) {
    eventTitle = await findEventTitle(input.eventId);
    if (eventTitle === null) return { ok: false, status: 404, error: "Event not found." };
    const open = await campaignsCol().where("eventId", "==", input.eventId).where("status", "==", "open").limit(1).get();
    if (!open.empty) return { ok: false, status: 409, error: "There is already an open campaign for this event." };
  }
  const [tree, assignments] = await Promise.all([readTree(), readAssignments()]);
  if (assignments.length === 0) return { ok: false, status: 400, error: "Plan the calling tree first: nobody is assigned to a caller yet." };

  const db = getAdminDb();
  const membersCol = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
  const rows: CallRow[] = [];
  for (let i = 0; i < assignments.length; i += 100) {
    const slice = assignments.slice(i, i + 100);
    const snaps = await db.getAll(...slice.map(a => membersCol.doc(a.memberId)));
    snaps.forEach((snap, index) => {
      if (!snap.exists) return;
      if (memberCallState(snap.data() as Parameters<typeof memberCallState>[0]) !== "ready") return;
      rows.push({ memberId: snap.id, callerUid: slice[index].callerUid, outcome: null, rsvp: null, attemptCount: 0 });
    });
  }
  if (rows.length === 0) return { ok: false, status: 400, error: "Nobody on the calling tree can be called right now." };

  const ref = campaignsCol().doc(input.id);
  const payload = {
    title: input.title,
    eventId: input.eventId,
    eventTitle,
    script: input.script,
    dueAt: input.dueAt,
    status: "open" as const,
    createdBy: input.actorUid,
    createdAt: input.now,
    closedBy: null,
    closedAt: null,
    treeVersion: tree.version,
    counts: computeCounts(rows)
  };
  const batches = [db.batch()];
  let ops = 0;
  const batch = () => {
    if (ops >= 450) {
      batches.push(db.batch());
      ops = 0;
    }
    ops += 1;
    return batches[batches.length - 1];
  };
  batch().create(ref, payload);
  for (const row of rows) {
    batch().set(ref.collection("calls").doc(row.memberId), { callerUid: row.callerUid, outcome: null, rsvp: null, attempts: [], updatedAt: input.now });
  }
  try {
    for (const b of batches) await b.commit();
  } catch (error) {
    if ((error as { code?: number }).code === 6) return { ok: false, status: 409, error: "A campaign with this id already exists." };
    throw error;
  }
  return { ok: true, campaign: mapCampaign(ref.id, payload), callers: [...new Set(rows.map(r => r.callerUid))] };
}

export type RecordAttemptInput = {
  campaignId: string;
  memberId: string;
  attemptId: string;
  input: AttemptInput;
  note: EnvelopeInput | null;
  actorUid: string;
  actorIsSuperAdmin: boolean;
  now: Date;
};

export type RecordAttemptResult = { ok: true; call: StoredCall; counts: CampaignCounts } | { ok: false; status: number; error: string };

/** Appends one attempt in a transaction: the rules decide, the counts move by the plan's delta. */
export async function recordAttempt(input: RecordAttemptInput): Promise<RecordAttemptResult> {
  const db = getAdminDb();
  const campaignRef = campaignsCol().doc(input.campaignId);
  const callRef = campaignRef.collection("calls").doc(input.memberId);
  const memberRef = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG)).doc(input.memberId);
  return db.runTransaction(async (tx: Transaction) => {
    const [campaignSnap, callSnap, memberSnap] = await Promise.all([tx.get(campaignRef), tx.get(callRef), tx.get(memberRef)]);
    if (!campaignSnap.exists || !callSnap.exists) return { ok: false, status: 404, error: "Not found." } as const;
    const campaign = mapCampaign(campaignSnap.id, campaignSnap.data() ?? {});
    const call = mapCall(callSnap.id, callSnap.data() ?? {});
    if (call.attempts.some(a => a.id === input.attemptId)) return { ok: false, status: 409, error: "This attempt was already recorded." } as const;
    if (!memberSnap.exists || memberCallState(memberSnap.data() as Parameters<typeof memberCallState>[0]) !== "ready") {
      return { ok: false, status: 409, error: "This person can no longer be called (opted out, no number, or disabled)." } as const;
    }
    const plan = planAttempt({ campaignStatus: campaign.status, row: call, input: input.input, actorUid: input.actorUid, actorIsSuperAdmin: input.actorIsSuperAdmin });
    if (!plan.ok) return plan;
    const attempt = { id: input.attemptId, at: input.now, outcome: input.input.outcome, byUid: input.actorUid, ...(input.note ? { note: input.note } : {}) };
    const counts: CampaignCounts = { ...campaign.counts };
    for (const [key, diff] of Object.entries(plan.countsDelta)) counts[key as keyof CampaignCounts] += diff ?? 0;
    tx.update(callRef, { outcome: plan.row.outcome, rsvp: plan.row.rsvp, attempts: [...callSnap.get("attempts") ?? [], attempt], updatedAt: input.now });
    tx.update(campaignRef, { counts });
    const stored: StoredCall = { ...plan.row, attempts: [...call.attempts, { ...attempt, at: input.now.getTime() }], updatedAt: input.now.getTime() };
    return { ok: true, call: stored, counts } as const;
  });
}

export async function closeCampaign(id: string, actorUid: string, now: Date): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ref = campaignsCol().doc(id);
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: "Not found." } as const;
    if (snap.get("status") === "closed") return { ok: false, status: 409, error: "Already closed." } as const;
    tx.update(ref, { status: "closed", closedBy: actorUid, closedAt: now });
    return { ok: true } as const;
  });
}

/** Callers who still have someone to reach in an open campaign (for the reminder email). */
export function callersWithWork(calls: CallRow[]): string[] {
  const uids = new Set<string>();
  for (const row of calls) if (row.outcome !== "reached" && row.outcome !== "declined" && row.outcome !== "wrong_number") uids.add(row.callerUid);
  return [...uids];
}

/** Admin names for the dashboard, without exposing anything else about the admins. */
export async function callerNames(): Promise<Record<string, string>> {
  return Object.fromEntries((await listAdmins(COMMUNITY_SLUG)).map(a => [a.id, a.name]));
}
