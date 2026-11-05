/**
 * Member groups (plan §15, Phase 11-A): standing teams such as the phone-tree callers, cooking, marketing and
 * shopping. A group has a name, a lead and members. Membership lives on the member as `groupIds` (decision D17),
 * so the Members page can filter by group without extra reads. Pure rules here; storage in `groups.server.ts`.
 */

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 400;
export const MAX_GROUPS_PER_MEMBER = 20;
export const MAX_MEMBERS_PER_CHANGE = 200;

/** The group whose admin members are suggested as callers on the Calling Tree page (11-C). */
export const CALLERS_KIND = "callers" as const;
export const PHONE_TREE_GROUP_ID = "phone_tree_callers";
export const PHONE_TREE_GROUP_NAME = "Phone tree callers";
export const PHONE_TREE_GROUP_DESCRIPTION = "Board members and volunteers who phone members about upcoming events.";

export type Group = {
  id: string;
  name: string;
  description: string;
  leadMemberId: string | null;
  kind: typeof CALLERS_KIND | null;
  active: boolean;
  builtIn: boolean;
};

export function cleanGroupName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX) : "";
}

export function cleanGroupDescription(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, GROUP_DESCRIPTION_MAX) : "";
}

/** Case-insensitive name key, so "Cooking team" and "cooking  TEAM" are one group. */
export function groupNameKey(name: string): string {
  return cleanGroupName(name).toLowerCase();
}

type AdminForLink = { id: string; authUid?: string | null; emailLower?: string | null; status?: string };
type MemberForLink = { uid?: string | null; emailLower?: string | null };

/**
 * The admin account a member is (decision D20), or null. Matches by sign-in id first, then by email. Only active
 * admins count, and a member without an email (phone only) never matches.
 */
export function linkMemberToAdmin<A extends AdminForLink>(member: MemberForLink, admins: A[]): A | null {
  const active = admins.filter(admin => admin.status === "active");
  if (member.uid) {
    const byUid = active.find(admin => admin.id === member.uid || (admin.authUid && admin.authUid === member.uid));
    if (byUid) return byUid;
  }
  const email = (member.emailLower ?? "").trim();
  if (!email.includes("@")) return null;
  return active.find(admin => (admin.emailLower ?? "").trim() === email) ?? null;
}

export type CallerLink = { memberId: string; name: string; status: string; adminId: string | null };

/**
 * What the phone tree callers group means for the calling tree (decision D20): members who are active admins are
 * suggested as callers; active members who are not (a phone-only member, an email that matches no admin) need admin
 * access before they can use My Calls. Disabled members are ignored. This only suggests: callers must still be
 * ticked and saved by a super admin, and the tree's own rule (every caller is an active admin, D15) is unchanged.
 */
export function suggestCallers(links: CallerLink[]): { suggestedAdminIds: string[]; needsAdminAccess: { memberId: string; name: string }[] } {
  const suggested = new Set<string>();
  const needsAdminAccess: { memberId: string; name: string }[] = [];
  for (const link of links) {
    if (link.status !== "active") continue;
    if (link.adminId) suggested.add(link.adminId);
    else needsAdminAccess.push({ memberId: link.memberId, name: link.name });
  }
  needsAdminAccess.sort((a, b) => a.name.localeCompare(b.name));
  return { suggestedAdminIds: [...suggested], needsAdminAccess };
}

export type MembershipPlan =
  | { ok: true; added: string[]; removed: string[] }
  | { ok: false; status: number; error: string };

/**
 * Who actually changes when ids are added to or removed from a group. `members` holds the current `groupIds` of
 * every member the request names that exists. Rules: people already in (or already out) are skipped, nobody may
 * end up in more than MAX_GROUPS_PER_MEMBER groups, the lead can't be removed (change the lead first), and an
 * id that is both added and removed is refused as a mistake.
 */
export function planMembership(params: {
  groupId: string;
  leadMemberId: string | null;
  members: Map<string, string[]>;
  add: string[];
  remove: string[];
}): MembershipPlan {
  const add = [...new Set(params.add)];
  const remove = [...new Set(params.remove)];
  if (add.some(id => remove.includes(id))) return { ok: false, status: 400, error: "Someone is in both the add and the remove list." };
  if (add.length + remove.length === 0) return { ok: false, status: 400, error: "Nobody to change." };
  if (add.length + remove.length > MAX_MEMBERS_PER_CHANGE) return { ok: false, status: 400, error: `Change at most ${MAX_MEMBERS_PER_CHANGE} people at a time.` };
  if (params.leadMemberId && remove.includes(params.leadMemberId)) {
    return { ok: false, status: 409, error: "That person is the group's lead. Make someone else lead first." };
  }
  const missing = add.find(id => !params.members.has(id));
  if (missing) return { ok: false, status: 404, error: "One of those people is not on the member list." };
  const added: string[] = [];
  for (const id of add) {
    const groups = params.members.get(id) ?? [];
    if (groups.includes(params.groupId)) continue;
    if (groups.length >= MAX_GROUPS_PER_MEMBER) return { ok: false, status: 409, error: `Someone is already in ${MAX_GROUPS_PER_MEMBER} groups, the most allowed.` };
    added.push(id);
  }
  const removed = remove.filter(id => (params.members.get(id) ?? []).includes(params.groupId));
  return { ok: true, added, removed };
}

/** Group names for a member's badges, in the list's own order; unknown ids (a deleted group) are skipped. */
export function groupNamesFor(groupIds: readonly string[] | undefined, groups: Pick<Group, "id" | "name">[]): string[] {
  const byId = new Map(groups.map(group => [group.id, group.name]));
  return (groupIds ?? []).map(id => byId.get(id)).filter((name): name is string => Boolean(name));
}
