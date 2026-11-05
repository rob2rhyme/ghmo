import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MembersClient, { type MemberRow } from "@/src/components/admin/members/MembersClient";
import { requireActiveAdmin, AdminAccessError, isSuperAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listMembers } from "@/src/lib/adminData.server";
import { listGroupsWithCounts } from "@/src/lib/groups.server";
import { POSITION_TIME_ZONE, currentPositionIdsByMember, todayIn } from "@/src/lib/positions";
import { listPositionsWithTerms } from "@/src/lib/positions.server";

/** Tab title: "Members · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Members" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembersPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/members");
    throw error;
  }

  const check = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  const members = (await listMembers(check)) as MemberRow[];

  // Groups and officer titles only add badges and filters; if they can't be read the list still works.
  const [groups, officers] = await Promise.all([
    listGroupsWithCounts()
      .then(list => list.map(({ id, name, active }) => ({ id, name, active })))
      .catch(() => []),
    listPositionsWithTerms()
      .then(({ positions, terms }) => {
        const titles = new Map(positions.map(p => [p.id, p.title]));
        const byMember = currentPositionIdsByMember(terms, todayIn(new Date(), POSITION_TIME_ZONE));
        return Object.fromEntries(Object.entries(byMember).map(([id, ids]) => [id, ids.map(pid => titles.get(pid)).filter((t): t is string => Boolean(t))]));
      })
      .catch(() => ({}))
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Members" description="Everyone on the community list, and whether they agreed to be emailed or called." />
      <MembersClient initialMembers={members ?? []} groups={groups} officers={officers} superAdmin={isSuperAdmin(check.admin)} />
    </div>
  );
}
