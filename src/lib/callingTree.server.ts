import { getAdminDb } from "./firebaseAdmin";
import { listAdmins, type AdminProfile } from "./admin";
import { COMMUNITY_SLUG } from "./community";
import { orgDocPath, orgMembersCollectionPath } from "./firestorePaths";
import type { Assignment } from "./callingTree";
import { callerLinksForGroup, findCallersGroup } from "./groups.server";
import { suggestCallers } from "./groups";

/**
 * Storage for the calling tree (plan §12.3). Server-written only; the rules deny every client read
 * and write, so the API is the only way in or out.
 *
 *  organizations/ghmo/callingTree/current                  callers[], version, updatedAt, updatedBy
 *  organizations/ghmo/callingTree/current/assignments/{id}  callerUid, assignedAt, assignedBy ("auto" | admin uid)
 */
const treeRef = () => getAdminDb().doc(`${orgDocPath(COMMUNITY_SLUG)}/callingTree/current`);
const assignmentsCol = () => treeRef().collection("assignments");

export type StoredTree = { callers: string[]; version: number; updatedAt: Date | null; updatedBy: string | null };
export type StoredAssignment = Assignment & { assignedAt: Date | null; assignedBy: string };

const toDate = (value: unknown): Date | null =>
  value && typeof value === "object" && "toDate" in value ? (value as { toDate: () => Date }).toDate() : null;

export async function readTree(): Promise<StoredTree> {
  const snap = await treeRef().get();
  const data = snap.data() ?? {};
  return {
    callers: Array.isArray(data.callers) ? (data.callers as string[]) : [],
    version: typeof data.version === "number" ? data.version : 0,
    updatedAt: toDate(data.updatedAt),
    updatedBy: (data.updatedBy as string | undefined) ?? null
  };
}

export async function readAssignments(callerUid?: string): Promise<StoredAssignment[]> {
  const query = callerUid ? assignmentsCol().where("callerUid", "==", callerUid) : assignmentsCol();
  const snap = await query.get();
  return snap.docs
    .map(doc => ({
      memberId: doc.id,
      callerUid: doc.get("callerUid") as string,
      assignedAt: toDate(doc.get("assignedAt")),
      assignedBy: (doc.get("assignedBy") as string | undefined) ?? "auto"
    }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

export type CallerCandidate = Pick<AdminProfile, "id" | "name" | "status"> & { suggested: boolean };
export type CallersGroupSummary = { id: string; name: string; needsAdminAccess: { memberId: string; name: string }[] };

/**
 * Active admins who may be callers (the BOD allowlist, decision D15), with the fields the pages show. Admins who
 * are in the phone tree callers group are marked `suggested` (decision D20, plan §15 11-C); members of that group
 * who are not admins are listed so the page can say they need admin access. Suggestions never change who may be a
 * caller: `saveTree` still accepts only active admins.
 */
export async function listCallerCandidates(): Promise<{ candidates: CallerCandidate[]; callersGroup: CallersGroupSummary | null }> {
  const [admins, group] = await Promise.all([listAdmins(COMMUNITY_SLUG), findCallersGroup()]);
  const { suggestedAdminIds, needsAdminAccess } = group && group.active ? suggestCallers(await callerLinksForGroup(group.id)) : { suggestedAdminIds: [], needsAdminAccess: [] };
  const suggested = new Set(suggestedAdminIds);
  return {
    candidates: admins.map(admin => ({ id: admin.id, name: admin.name, status: admin.status, suggested: admin.status === "active" && suggested.has(admin.id) })),
    callersGroup: group && group.active ? { id: group.id, name: group.name, needsAdminAccess } : null
  };
}

export type SaveTreeInput = {
  callers: string[];
  assignments: (Assignment & { manual: boolean })[];
  actorUid: string;
  now: Date;
};

export type SaveTreeResult =
  | { ok: true; version: number; added: number; moved: number; removed: number }
  | { ok: false; status: number; error: string };

/**
 * Replaces the tree in one transaction: unknown callers, members or callers not on the list are refused;
 * unchanged assignments keep their date and author; moved or new ones record who placed them.
 */
export async function saveTree(input: SaveTreeInput): Promise<SaveTreeResult> {
  const admins = await listAdmins(COMMUNITY_SLUG);
  const activeAdminIds = new Set(admins.filter(a => a.status === "active").map(a => a.id));
  const callers = [...new Set(input.callers)];
  const badCaller = callers.find(uid => !activeAdminIds.has(uid));
  if (badCaller) return { ok: false, status: 400, error: "Every caller must be an active admin." };
  const callerSet = new Set(callers);
  if (input.assignments.some(a => !callerSet.has(a.callerUid))) return { ok: false, status: 400, error: "Every assignment must point at a listed caller." };
  const ids = input.assignments.map(a => a.memberId);
  if (new Set(ids).size !== ids.length) return { ok: false, status: 400, error: "A member can only have one caller." };

  const db = getAdminDb();
  const membersCol = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
  // Members must exist and be callable at the time of saving (the browser also checks; this is the floor).
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map(id => membersCol.doc(id));
    const snaps = await db.getAll(...refs);
    const bad = snaps.find(snap => !snap.exists || snap.get("status") !== "active" || snap.get("hasPhone") !== true || snap.get("callOptOutAt"));
    if (bad) return { ok: false, status: 400, error: "One of the members can no longer be called. Reload and plan again." };
  }

  const existing = await readAssignments();
  const before = new Map(existing.map(a => [a.memberId, a]));
  const next = new Map(input.assignments.map(a => [a.memberId, a]));
  let added = 0;
  let moved = 0;
  let removed = 0;

  // Firestore allows 500 writes per batch; the tree document itself takes one.
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

  for (const [memberId, previous] of before) {
    if (!next.has(memberId)) {
      batch().delete(assignmentsCol().doc(memberId));
      removed += 1;
    } else if (next.get(memberId)!.callerUid !== previous.callerUid) {
      moved += 1;
    }
  }
  for (const [memberId, a] of next) {
    const previous = before.get(memberId);
    if (previous && previous.callerUid === a.callerUid) continue;
    if (!previous) added += 1;
    batch().set(assignmentsCol().doc(memberId), { callerUid: a.callerUid, assignedAt: input.now, assignedBy: a.manual ? input.actorUid : "auto" });
  }

  const tree = await readTree();
  const version = tree.version + 1;
  batch().set(treeRef(), { callers, version, updatedAt: input.now, updatedBy: input.actorUid });
  for (const b of batches) await b.commit();
  return { ok: true, version, added, moved, removed };
}

/** The member documents behind a set of assignments, in the same order; missing members are left out. */
export async function loadAssignedMembers(assignments: Assignment[]): Promise<Record<string, unknown>[]> {
  const db = getAdminDb();
  const col = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < assignments.length; i += 100) {
    const refs = assignments.slice(i, i + 100).map(a => col.doc(a.memberId));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) if (snap.exists) out.push({ id: snap.id, ...snap.data() });
  }
  return out;
}
