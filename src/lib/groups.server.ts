import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgGroupsCollectionPath, orgMembersCollectionPath } from "./firestorePaths";
import { memberDisplayName } from "./members";
import { listAdmins } from "./admin";
import { fail, type Failure } from "./adminRoute.server";
import { clearGroupFromTasks, openTaskCountsByGroup } from "./eventTasks.server";
import {
  CALLERS_KIND,
  PHONE_TREE_GROUP_DESCRIPTION,
  PHONE_TREE_GROUP_ID,
  PHONE_TREE_GROUP_NAME,
  cleanGroupDescription,
  cleanGroupName,
  groupNameKey,
  linkMemberToAdmin,
  planMembership,
  type CallerLink,
  type Group
} from "./groups";

/**
 * Storage for member groups (plan §15, 11-A). Server-written only. A group is `groups/{id}`; who is in it is the
 * `groupIds` array on each member document (decision D17), written only here. Queries are single-field
 * (`array-contains` or a plain read), so no composite index is needed.
 */
const groupsCol = () => getAdminDb().collection(orgGroupsCollectionPath(COMMUNITY_SLUG));
const membersCol = () => getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG));

const ALREADY_EXISTS = 6;
const BATCH_LIMIT = 450;

function mapGroup(id: string, data: Record<string, unknown>): Group {
  return {
    id,
    name: (data.name as string) ?? id,
    description: (data.description as string) ?? "",
    leadMemberId: typeof data.leadMemberId === "string" && data.leadMemberId ? data.leadMemberId : null,
    kind: data.kind === CALLERS_KIND ? CALLERS_KIND : null,
    active: data.active !== false,
    builtIn: data.builtIn === true
  };
}

/** Creates the phone-tree callers group the first time anyone looks (found later by its kind, so it can be renamed). */
export async function ensureBuiltInGroups(now: Date = new Date()): Promise<void> {
  const ref = groupsCol().doc(PHONE_TREE_GROUP_ID);
  if ((await ref.get()).exists) return;
  try {
    await ref.create({
      name: PHONE_TREE_GROUP_NAME,
      description: PHONE_TREE_GROUP_DESCRIPTION,
      leadMemberId: null,
      kind: CALLERS_KIND,
      active: true,
      builtIn: true,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
  }
}

export type GroupWithCount = Group & { memberCount: number; openTaskCount: number };

/** Every group with how many members it has (counted from one read of the members' `groupIds`). */
export async function listGroupsWithCounts(): Promise<GroupWithCount[]> {
  await ensureBuiltInGroups();
  const [groupSnap, memberSnap, openTasks] = await Promise.all([groupsCol().get(), membersCol().select("groupIds").get(), openTaskCountsByGroup()]);
  const counts = new Map<string, number>();
  for (const doc of memberSnap.docs) {
    const ids = doc.get("groupIds");
    if (Array.isArray(ids)) for (const id of ids) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
  }
  return groupSnap.docs
    .map(doc => ({ ...mapGroup(doc.id, doc.data()), memberCount: counts.get(doc.id) ?? 0, openTaskCount: openTasks.get(doc.id) ?? 0 }))
    .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
}

export async function readGroup(id: string): Promise<Group | null> {
  await ensureBuiltInGroups();
  const snap = await groupsCol().doc(id).get();
  return snap.exists ? mapGroup(snap.id, snap.data() ?? {}) : null;
}

/** Ids of the members in a group. */
export async function listGroupMemberIds(groupId: string): Promise<string[]> {
  const snap = await membersCol().where("groupIds", "array-contains", groupId).select().get();
  return snap.docs.map(doc => doc.id);
}

async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const key = groupNameKey(name);
  const snap = await groupsCol().get();
  return snap.docs.some(doc => doc.id !== exceptId && groupNameKey(String(doc.get("name") ?? "")) === key);
}

export async function createGroup(input: { name: unknown; description: unknown; now: Date }): Promise<{ ok: true; group: Group } | Failure> {
  const name = cleanGroupName(input.name);
  if (!name) return fail(400, "Give the group a name.");
  await ensureBuiltInGroups(input.now);
  if (await nameTaken(name)) return fail(409, "There is already a group with that name.");
  const ref = groupsCol().doc();
  const data = { name, description: cleanGroupDescription(input.description), leadMemberId: null, kind: null, active: true, builtIn: false, createdAt: input.now, updatedAt: input.now };
  await ref.create(data);
  return { ok: true, group: mapGroup(ref.id, data) };
}

export async function updateGroup(
  id: string,
  patch: { name?: unknown; description?: unknown; leadMemberId?: string | null; active?: boolean },
  now: Date = new Date()
): Promise<{ ok: true; group: Group; before: Group } | Failure> {
  const ref = groupsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That group doesn't exist.");
  const before = mapGroup(id, snap.data() ?? {});
  const updates: Record<string, unknown> = { updatedAt: now };
  if (patch.name !== undefined) {
    const name = cleanGroupName(patch.name);
    if (!name) return fail(400, "Give the group a name.");
    if (await nameTaken(name, id)) return fail(409, "There is already a group with that name.");
    updates.name = name;
  }
  if (patch.description !== undefined) updates.description = cleanGroupDescription(patch.description);
  if (patch.active !== undefined) updates.active = patch.active;
  if (patch.leadMemberId !== undefined) {
    if (patch.leadMemberId !== null) {
      const member = await membersCol().doc(patch.leadMemberId).get();
      if (!member.exists) return fail(404, "That person isn't on the member list.");
      const groupIds = member.get("groupIds");
      if (!Array.isArray(groupIds) || !groupIds.includes(id)) return fail(409, "Add them to the group first, then make them lead.");
    }
    updates.leadMemberId = patch.leadMemberId;
  }
  await ref.update(updates);
  return { ok: true, group: mapGroup(id, { ...snap.data(), ...updates }), before };
}

/** Deletes a group and removes it from every member, in batches. The built-in phone-tree group can't be deleted. */
export async function deleteGroup(id: string): Promise<{ ok: true; before: Group; removedFrom: number } | Failure> {
  const ref = groupsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That group doesn't exist.");
  const before = mapGroup(id, snap.data() ?? {});
  if (before.builtIn) return fail(409, "This group is built in and can't be deleted. You can turn it off instead.");
  const memberIds = await listGroupMemberIds(id);
  const db = getAdminDb();
  for (let i = 0; i < memberIds.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const memberId of memberIds.slice(i, i + BATCH_LIMIT)) batch.update(membersCol().doc(memberId), { groupIds: FieldValue.arrayRemove(id) });
    await batch.commit();
  }
  await clearGroupFromTasks(id);
  await ref.delete();
  return { ok: true, before, removedFrom: memberIds.length };
}

/** Adds and removes people in one group, using the pure rules in `planMembership`. */
export async function updateGroupMembers(input: { groupId: string; add: string[]; remove: string[]; now: Date }): Promise<{ ok: true; added: string[]; removed: string[]; group: Group } | Failure> {
  const group = await readGroup(input.groupId);
  if (!group) return fail(404, "That group doesn't exist.");
  const ids = [...new Set([...input.add, ...input.remove])];
  const current = new Map<string, string[]>();
  const db = getAdminDb();
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map(id => membersCol().doc(id)));
    for (const snap of snaps) if (snap.exists) current.set(snap.id, Array.isArray(snap.get("groupIds")) ? (snap.get("groupIds") as string[]) : []);
  }
  const plan = planMembership({ groupId: input.groupId, leadMemberId: group.leadMemberId, members: current, add: input.add, remove: input.remove });
  if (!plan.ok) return fail(plan.status, plan.error);
  const changes = [
    ...plan.added.map(id => ({ id, update: { groupIds: FieldValue.arrayUnion(input.groupId), updatedAt: input.now } })),
    ...plan.removed.map(id => ({ id, update: { groupIds: FieldValue.arrayRemove(input.groupId), updatedAt: input.now } }))
  ];
  for (let i = 0; i < changes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const change of changes.slice(i, i + BATCH_LIMIT)) batch.update(membersCol().doc(change.id), change.update);
    await batch.commit();
  }
  return { ok: true, added: plan.added, removed: plan.removed, group };
}

/** The group marked as the phone tree callers (found by its kind, so it can be renamed). */
export async function findCallersGroup(): Promise<Group | null> {
  await ensureBuiltInGroups();
  const snap = await groupsCol().where("kind", "==", CALLERS_KIND).limit(1).get();
  return snap.empty ? null : mapGroup(snap.docs[0].id, snap.docs[0].data());
}

/** For each member of a group, the admin account they are (decision D20), matched by sign-in id and then by email. */
export async function callerLinksForGroup(groupId: string): Promise<CallerLink[]> {
  const [snap, admins] = await Promise.all([membersCol().where("groupIds", "array-contains", groupId).get(), listAdmins(COMMUNITY_SLUG)]);
  return snap.docs.map(doc => {
    const data = doc.data();
    const admin = linkMemberToAdmin({ uid: data.uid as string | null | undefined, emailLower: data.emailLower as string | null | undefined }, admins);
    return {
      memberId: doc.id,
      name: memberDisplayName({ name: data.name as string | null | undefined, emailLower: data.emailLower as string | null | undefined }),
      status: (data.status as string | undefined) ?? "active",
      adminId: admin?.id ?? null
    };
  });
}
