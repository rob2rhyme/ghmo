import "server-only";

import { listAdmins } from "./admin";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgAdminsCollectionPath } from "./firestorePaths";
import { fail, type Failure } from "./adminRoute.server";
import { adminView, cleanAdminName, planAddAdmin, planRoleChange, planStatusChange, rolesFor, sortAdminViews, type AdminRecord, type AdminRole, type AdminView } from "./adminManagement";

/**
 * Managing admins (plan §22, Phase 17). Server-only. Every change reads the whole admin list inside a transaction (a handful of
 * documents), so two super admins acting at the same moment cannot both remove the last active super admin.
 */
const adminsCol = () => getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG));

const toRecord = (id: string, data: FirebaseFirestore.DocumentData): AdminRecord => ({
  id,
  name: typeof data.name === "string" ? data.name : "",
  emailLower: typeof data.emailLower === "string" ? data.emailLower : "",
  roles: Array.isArray(data.roles) ? (data.roles as string[]) : [],
  status: data.status === "active" ? "active" : "disabled"
});

/** Everyone on the admin list, super admins first. Names, roles, state and times; nothing secret. */
export async function listAdminAccounts(youId: string): Promise<AdminView[]> {
  return sortAdminViews((await listAdmins(COMMUNITY_SLUG)).map(admin => adminView(admin, youId)));
}

export async function addAdmin(input: { name: unknown; email: unknown; role: unknown; actorUid: string; now: Date }): Promise<{ ok: true; id: string; name: string; role: AdminRole } | Failure> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(adminsCol());
    const plan = planAddAdmin({ admins: snap.docs.map(doc => toRecord(doc.id, doc.data())), name: input.name, email: input.email, role: input.role });
    if (!plan.ok) return fail(plan.status, plan.error);
    const ref = adminsCol().doc();
    tx.create(ref, { name: plan.name, email: plan.emailLower, emailLower: plan.emailLower, roles: rolesFor(plan.role), status: "active", createdAt: input.now, createdBy: input.actorUid });
    return { ok: true as const, id: ref.id, name: plan.name, role: plan.role };
  });
}

export async function setAdminStatus(input: { targetId: string; actorId: string; status: "active" | "disabled"; now: Date }): Promise<{ ok: true; name: string; changed: boolean } | Failure> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(adminsCol());
    const admins = snap.docs.map(doc => toRecord(doc.id, doc.data()));
    const plan = planStatusChange({ admins, targetId: input.targetId, actorId: input.actorId, status: input.status });
    if (!plan.ok) return fail(plan.status, plan.error);
    const target = admins.find(admin => admin.id === input.targetId) as AdminRecord;
    if (plan.changed) tx.update(adminsCol().doc(input.targetId), { status: input.status, updatedAt: input.now });
    return { ok: true as const, name: target.name, changed: plan.changed };
  });
}

export async function setAdminRole(input: { targetId: string; actorId: string; role: AdminRole; now: Date }): Promise<{ ok: true; name: string; changed: boolean; before: AdminRole } | Failure> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(adminsCol());
    const admins = snap.docs.map(doc => toRecord(doc.id, doc.data()));
    const plan = planRoleChange({ admins, targetId: input.targetId, actorId: input.actorId, role: input.role });
    if (!plan.ok) return fail(plan.status, plan.error);
    const target = admins.find(admin => admin.id === input.targetId) as AdminRecord;
    if (plan.changed) tx.update(adminsCol().doc(input.targetId), { roles: rolesFor(input.role), updatedAt: input.now });
    return { ok: true as const, name: target.name, changed: plan.changed, before: target.roles.includes("super_admin") ? ("super_admin" as const) : ("admin" as const) };
  });
}

/** Fixes a name. An email address cannot be changed here (D55). */
export async function renameAdmin(input: { targetId: string; name: unknown; now: Date }): Promise<{ ok: true; before: string; name: string } | Failure> {
  const name = cleanAdminName(input.name);
  if (!name) return fail(400, "Enter their name.");
  const ref = adminsCol().doc(input.targetId);
  const snap = await ref.get();
  if (!snap.exists) return fail(404, "That admin isn't on the list.");
  const before = typeof snap.get("name") === "string" ? (snap.get("name") as string) : "";
  if (before !== name) await ref.update({ name, updatedAt: input.now });
  return { ok: true, before, name };
}
