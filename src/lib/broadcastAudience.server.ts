import "server-only";

import { selectRecipients, type BroadcastAudience } from "./broadcast";
import type { AudienceOptions } from "./broadcast.shared";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgMembersCollectionPath } from "./firestorePaths";
import { listGroupsWithCounts, readGroup } from "./groups.server";

/**
 * Who a broadcast can go to (plan §30, 23-B, D91–D92): everyone who agreed to email, or one group that
 * is turned on. Counts are "who could be emailed right now"; the real list is taken again when sending starts.
 */

type MemberForCount = Parameters<typeof selectRecipients>[0][number];

/** How many members each audience would reach now: everyone, and each turned-on group. One read of the members. */
export async function audienceOptions(): Promise<AudienceOptions> {
  const [memberSnap, groups] = await Promise.all([getAdminDb().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).get(), listGroupsWithCounts()]);
  const ready = selectRecipients(memberSnap.docs.map(doc => doc.data() as MemberForCount));
  const counts = new Map<string, number>();
  for (const member of ready) {
    if (Array.isArray(member.groupIds)) for (const id of member.groupIds) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
  }
  return {
    all: ready.length,
    groups: groups
      .filter(group => group.active)
      .map(group => ({ id: group.id, name: group.name, count: counts.get(group.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

export type AudienceCheck = { ok: true; groupName: string | null } | { ok: false; status: number; error: string; code: string };

/**
 * A group audience must name a group that exists and is turned on (D91). Checked when a draft is saved,
 * submitted or approved, and when sending starts, so a turned-off group never gets an email.
 */
export async function checkAudience(audience: BroadcastAudience | undefined): Promise<AudienceCheck> {
  if (audience?.kind !== "group") return { ok: true, groupName: null };
  const group = await readGroup(audience.groupId);
  if (!group) return { ok: false, status: 409, error: "The group this broadcast was for no longer exists. Pick another group, or everyone.", code: "GROUP_GONE" };
  if (!group.active) return { ok: false, status: 409, error: `The ${group.name} group is turned off. Pick another group, or everyone.`, code: "GROUP_OFF" };
  return { ok: true, groupName: group.name };
}

/** The group's current name for a broadcast, or null (everyone, or a group that was deleted). */
export async function audienceGroupName(audience: BroadcastAudience | undefined): Promise<string | null> {
  if (audience?.kind !== "group") return null;
  return (await readGroup(audience.groupId))?.name ?? null;
}

/** Audit fields for a group broadcast (D93): which group, by id and name. Nothing extra for everyone. */
export function audienceAudit(audience: BroadcastAudience | undefined, groupName: string | null): Record<string, unknown> {
  return audience?.kind === "group" ? { audience: "group", audienceGroupId: audience.groupId, audienceGroupName: groupName } : { audience: "all" };
}

/** The activity log's detail line for a group broadcast ("To: Cooking team"); none for everyone. */
export function audienceSummary(audience: BroadcastAudience | undefined, groupName: string | null): string | undefined {
  return audience?.kind === "group" ? `To: ${groupName ?? "a deleted group"}` : undefined;
}
