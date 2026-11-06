/**
 * Pure rules for managing admins (plan §22, Phase 17). No network, no database: every rule is a function of the whole admin
 * list, so the guards that stop a lock-out (you, or the last super admin) are tested without a server.
 */
export type AdminRole = "super_admin" | "admin";
export type AdminRecord = { id: string; name: string; emailLower: string; roles: string[]; status: "active" | "disabled" | string };

export const ADMIN_NAME_MAX = 120;

const EMAIL_PATTERN = /^[^\s@,;"]+@[^\s@,;"]+\.[^\s@,;"]+$/;

/** The role an admin record has. A record with the super admin role is a super admin, whatever else it lists. */
export const roleOf = (roles: string[]): AdminRole => (roles.includes("super_admin") ? "super_admin" : "admin");

/** The `roles` array stored for a role. */
export const rolesFor = (role: AdminRole): string[] => [role];

export const isActiveSuperAdmin = (admin: AdminRecord) => admin.status === "active" && admin.roles.includes("super_admin");

export function cleanAdminName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, ADMIN_NAME_MAX) : "";
}

/** A lowercase address that looks like one, or null. */
export function cleanAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

export type Plan<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const refuse = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export function planAddAdmin(input: { admins: AdminRecord[]; name: unknown; email: unknown; role: unknown }): Plan<{ name: string; emailLower: string; role: AdminRole }> {
  const name = cleanAdminName(input.name);
  if (!name) return refuse(400, "Enter their name.");
  const emailLower = cleanAdminEmail(input.email);
  if (!emailLower) return refuse(400, "Enter a valid email address.");
  if (input.role !== "admin" && input.role !== "super_admin") return refuse(400, "Choose Admin or Super admin.");
  const existing = input.admins.find(admin => admin.emailLower === emailLower);
  if (existing) {
    return refuse(
      409,
      existing.status === "active" ? `${existing.name || "Someone"} is already an admin with that email address.` : `${existing.name || "Someone"} is already on the list with that email address, and turned off. Turn them on instead.`
    );
  }
  return { ok: true, name, emailLower, role: input.role };
}

function find(admins: AdminRecord[], id: string): AdminRecord | null {
  return admins.find(admin => admin.id === id) ?? null;
}

/**
 * Turning an admin off or on. Not yourself (a super admin could lock themselves out of the very page that fixes it), and
 * never the last active super admin. Turning someone to the state they are already in is accepted and changes nothing.
 */
export function planStatusChange(input: { admins: AdminRecord[]; targetId: string; actorId: string; status: "active" | "disabled" }): Plan<{ changed: boolean }> {
  const target = find(input.admins, input.targetId);
  if (!target) return refuse(404, "That admin isn't on the list.");
  if (target.status === input.status) return { ok: true, changed: false };
  if (input.status === "disabled") {
    if (target.id === input.actorId) return refuse(409, "You can't turn yourself off. Ask another super admin to do it.");
    if (isActiveSuperAdmin(target) && input.admins.filter(isActiveSuperAdmin).length <= 1) {
      return refuse(409, "This is the only active super admin, so it can't be turned off. Make another admin a super admin first.");
    }
  }
  return { ok: true, changed: true };
}

/** Changing a role. Not your own, and the last active super admin stays a super admin. */
export function planRoleChange(input: { admins: AdminRecord[]; targetId: string; actorId: string; role: AdminRole }): Plan<{ changed: boolean }> {
  const target = find(input.admins, input.targetId);
  if (!target) return refuse(404, "That admin isn't on the list.");
  if (roleOf(target.roles) === input.role) return { ok: true, changed: false };
  if (target.id === input.actorId) return refuse(409, "You can't change your own role. Ask another super admin to do it.");
  if (input.role === "admin" && isActiveSuperAdmin(target) && input.admins.filter(isActiveSuperAdmin).length <= 1) {
    return refuse(409, "This is the only active super admin, so it can't be made an ordinary admin. Make another admin a super admin first.");
  }
  return { ok: true, changed: true };
}

/** What the admin list shows about one admin: nothing secret, and no email address beyond what the list already carries. */
export type AdminView = { id: string; name: string; email: string; role: AdminRole; active: boolean; createdAt: number | null; lastLoginAt: number | null; isYou: boolean };

export function adminView(admin: AdminRecord & { email?: string; createdAt?: Date; lastLoginAt?: Date }, youId: string): AdminView {
  return {
    id: admin.id,
    name: admin.name || "Unnamed admin",
    email: admin.email || admin.emailLower,
    role: roleOf(admin.roles),
    active: admin.status === "active",
    createdAt: admin.createdAt ? admin.createdAt.getTime() : null,
    lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.getTime() : null,
    isYou: admin.id === youId
  };
}

/** Super admins first, then by name, so the people who can fix things are at the top. */
export function sortAdminViews(views: AdminView[]): AdminView[] {
  return [...views].sort((a, b) => Number(b.role === "super_admin") - Number(a.role === "super_admin") || a.name.localeCompare(b.name));
}
