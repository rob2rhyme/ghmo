import "server-only";

import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgMembersCollectionPath, orgPositionTermsCollectionPath, orgPositionsCollectionPath } from "./firestorePaths";
import { memberDisplayName } from "./members";
import { fail, type Failure } from "./adminRoute.server";
import {
  DEFAULT_POSITIONS,
  NOTE_MAX,
  cleanTitle,
  isValidDate,
  planTerm,
  sortPositions,
  sortTermsNewestFirst,
  termEditConflict,
  type Position,
  type Term
} from "./positions";

/**
 * Storage for officer positions and their terms (plan §15, 11-A). Server-written only; the rules let admins read
 * and nobody write, so every change is audited by its route.
 *
 *  organizations/ghmo/positions/{id}      title, titleNe, order, active, builtIn, multiple
 *  organizations/ghmo/positionTerms/{id}  positionId, memberId, startsOn, endsOn, note
 *
 * Every query is a single-field equality (or a plain read) sorted in memory, so no composite index is needed.
 */
const positionsCol = () => getAdminDb().collection(orgPositionsCollectionPath(COMMUNITY_SLUG));
const termsCol = () => getAdminDb().collection(orgPositionTermsCollectionPath(COMMUNITY_SLUG));
const membersCol = () => getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG));

const ALREADY_EXISTS = 6;

function mapPosition(id: string, data: Record<string, unknown>): Position {
  return {
    id,
    title: (data.title as string) ?? id,
    titleNe: (data.titleNe as string) ?? "",
    order: typeof data.order === "number" ? data.order : 0,
    active: data.active !== false,
    builtIn: data.builtIn === true,
    multiple: data.multiple === true
  };
}

function mapTerm(id: string, data: Record<string, unknown>): Term {
  return {
    id,
    positionId: (data.positionId as string) ?? "",
    memberId: (data.memberId as string) ?? "",
    startsOn: (data.startsOn as string) ?? "",
    endsOn: typeof data.endsOn === "string" && data.endsOn ? data.endsOn : null,
    note: (data.note as string) ?? ""
  };
}

/** Seeds the standard positions the first time anyone looks. Safe to call concurrently and repeatedly. */
export async function ensurePositionDefaults(now: Date = new Date()): Promise<void> {
  if (!(await positionsCol().limit(1).get()).empty) return;
  const batch = getAdminDb().batch();
  DEFAULT_POSITIONS.forEach((position, index) => {
    batch.create(positionsCol().doc(position.id), {
      title: position.title,
      titleNe: position.titleNe,
      order: (index + 1) * 10,
      active: true,
      builtIn: true,
      multiple: position.multiple,
      createdAt: now,
      updatedAt: now
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    // Another admin opened the page at the same moment and seeded first.
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
  }
}

export async function listPositionsWithTerms(): Promise<{ positions: Position[]; terms: Term[] }> {
  await ensurePositionDefaults();
  const [positionSnap, termSnap] = await Promise.all([positionsCol().get(), termsCol().get()]);
  return {
    positions: sortPositions(positionSnap.docs.map(doc => mapPosition(doc.id, doc.data()))),
    terms: sortTermsNewestFirst(termSnap.docs.map(doc => mapTerm(doc.id, doc.data())))
  };
}

const titleTaken = (positions: Position[], title: string, exceptId?: string) =>
  positions.some(position => position.id !== exceptId && position.title.toLowerCase() === title.toLowerCase());

export async function createPosition(input: { title: unknown; titleNe: unknown; multiple: boolean; now: Date }): Promise<{ ok: true; position: Position } | Failure> {
  const title = cleanTitle(input.title);
  if (!title) return fail(400, "Give the position a title.");
  const { positions } = await listPositionsWithTerms();
  if (titleTaken(positions, title)) return fail(409, "There is already a position with that title.");
  const order = positions.reduce((max, position) => Math.max(max, position.order), 0) + 10;
  const ref = positionsCol().doc();
  const data = { title, titleNe: cleanTitle(input.titleNe), order, active: true, builtIn: false, multiple: input.multiple, createdAt: input.now, updatedAt: input.now };
  await ref.create(data);
  return { ok: true, position: mapPosition(ref.id, data) };
}

export async function updatePosition(
  id: string,
  patch: { title?: unknown; titleNe?: unknown; order?: number; active?: boolean; multiple?: boolean },
  now: Date = new Date()
): Promise<{ ok: true; position: Position; before: Position } | Failure> {
  const ref = positionsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That position doesn't exist.");
  const before = mapPosition(id, snap.data() ?? {});
  const updates: Record<string, unknown> = { updatedAt: now };
  if (patch.title !== undefined) {
    const title = cleanTitle(patch.title);
    if (!title) return fail(400, "Give the position a title.");
    if (titleTaken((await listPositionsWithTerms()).positions, title, id)) return fail(409, "There is already a position with that title.");
    updates.title = title;
  }
  if (patch.titleNe !== undefined) updates.titleNe = cleanTitle(patch.titleNe);
  if (patch.order !== undefined) updates.order = patch.order;
  if (patch.active !== undefined) updates.active = patch.active;
  if (patch.multiple !== undefined) updates.multiple = patch.multiple;
  await ref.update(updates);
  return { ok: true, position: mapPosition(id, { ...snap.data(), ...updates }), before };
}

/**
 * Records a new term, and ends earlier holders the day before when asked, in one transaction so two admins can't
 * both seat a president. The rules for overlaps live in `planTerm`.
 */
export async function createTerm(input: {
  positionId: string;
  memberId: string;
  startsOn: unknown;
  endsOn: unknown;
  note: unknown;
  endPrevious: boolean;
  actorUid: string;
  now: Date;
}): Promise<{ ok: true; term: Term; position: Position; memberName: string; closed: number } | Failure> {
  const db = getAdminDb();
  const positionRef = positionsCol().doc(input.positionId);
  const memberRef = membersCol().doc(input.memberId);
  return db.runTransaction(async tx => {
    const [positionSnap, memberSnap, termSnap] = await Promise.all([
      tx.get(positionRef),
      tx.get(memberRef),
      tx.get(termsCol().where("positionId", "==", input.positionId))
    ]);
    if (!positionSnap.exists) return fail(404, "That position doesn't exist.");
    const position = mapPosition(positionSnap.id, positionSnap.data() ?? {});
    if (!position.active) return fail(409, "That position is turned off. Turn it on first.");
    if (!memberSnap.exists) return fail(404, "That person isn't on the member list.");
    const member = memberSnap.data() ?? {};
    if (member.status !== "active") return fail(409, "That member is turned off. Turn them on first.");
    const plan = planTerm({
      terms: termSnap.docs.map(doc => mapTerm(doc.id, doc.data())),
      position,
      memberId: input.memberId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      endPrevious: input.endPrevious
    });
    if (!plan.ok) return fail(409, plan.error);
    const ref = termsCol().doc();
    const data = {
      positionId: input.positionId,
      memberId: input.memberId,
      startsOn: input.startsOn as string,
      endsOn: typeof input.endsOn === "string" && input.endsOn ? input.endsOn : null,
      note: typeof input.note === "string" ? input.note.trim().slice(0, NOTE_MAX) : "",
      createdBy: input.actorUid,
      createdAt: input.now,
      updatedAt: input.now
    };
    for (const close of plan.closes) tx.update(termsCol().doc(close.termId), { endsOn: close.endsOn, updatedAt: input.now });
    tx.create(ref, data);
    return { ok: true as const, term: mapTerm(ref.id, data), position, memberName: memberDisplayName({ name: member.name as string | undefined, emailLower: member.emailLower as string | undefined }), closed: plan.closes.length };
  });
}

/** Changes a term's dates or note (for example to end it today). The same person can't overlap themselves. */
export async function updateTerm(
  termId: string,
  patch: { startsOn?: unknown; endsOn?: unknown; note?: unknown },
  now: Date = new Date()
): Promise<{ ok: true; term: Term; before: Term } | Failure> {
  const db = getAdminDb();
  return db.runTransaction(async tx => {
    const ref = termsCol().doc(termId);
    const snap = await tx.get(ref);
    if (!snap.exists) return fail(404, "That term doesn't exist.");
    const before = mapTerm(snap.id, snap.data() ?? {});
    const siblings = await tx.get(termsCol().where("positionId", "==", before.positionId));
    const startsOn = patch.startsOn !== undefined ? patch.startsOn : before.startsOn;
    const endsOn = patch.endsOn !== undefined ? (patch.endsOn === "" ? null : patch.endsOn) : before.endsOn;
    if (!isValidDate(startsOn)) return fail(400, "Enter the start date.");
    if (endsOn !== null && !isValidDate(endsOn)) return fail(400, "The end date isn't a real date.");
    const conflict = termEditConflict({
      terms: siblings.docs.map(doc => mapTerm(doc.id, doc.data())),
      termId,
      memberId: before.memberId,
      startsOn,
      endsOn: endsOn as string | null
    });
    if (conflict) return fail(409, conflict);
    const updates: Record<string, unknown> = { startsOn, endsOn, updatedAt: now };
    if (patch.note !== undefined) updates.note = typeof patch.note === "string" ? patch.note.trim().slice(0, NOTE_MAX) : "";
    tx.update(ref, updates);
    return { ok: true as const, term: mapTerm(termId, { ...snap.data(), ...updates }), before };
  });
}

export async function deleteTerm(termId: string): Promise<{ ok: true; before: Term } | Failure> {
  const ref = termsCol().doc(termId);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That term doesn't exist.");
  const before = mapTerm(termId, snap.data() ?? {});
  await ref.delete();
  return { ok: true, before };
}

export async function readPosition(id: string): Promise<Position | null> {
  const snap = await positionsCol().doc(id).get();
  return snap.exists ? mapPosition(snap.id, snap.data() ?? {}) : null;
}
