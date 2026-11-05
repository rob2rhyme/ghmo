import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MemberProfileClient, { type ProfileMember } from "@/src/components/admin/members/MemberProfileClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getMember } from "@/src/lib/adminData.server";
import { groupNamesFor } from "@/src/lib/groups";
import { listGroupsWithCounts } from "@/src/lib/groups.server";
import { memberDisplayName } from "@/src/lib/members";
import { POSITION_TIME_ZONE, currentPositionIdsByMember, todayIn } from "@/src/lib/positions";
import { listPositionsWithTerms } from "@/src/lib/positions.server";

/** Tab title: "Member profile · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Member profile" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberProfilePage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  let check;
  try {
    check = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect(`/admin/login?next=/admin/members/${encodeURIComponent(memberId)}`);
    throw error;
  }
  const member = (await getMember(check, memberId)) as ProfileMember | null;
  if (!member) notFound();

  // Groups and officer titles are only badges here; if they can't be read the profile still works.
  const [groupNames, officerTitles] = await Promise.all([
    listGroupsWithCounts()
      .then(groups => groupNamesFor(member.groupIds, groups))
      .catch(() => [] as string[]),
    listPositionsWithTerms()
      .then(({ positions, terms }) => {
        const titles = new Map(positions.map(p => [p.id, p.title]));
        return (currentPositionIdsByMember(terms, todayIn(new Date(), POSITION_TIME_ZONE))[memberId] ?? []).map(id => titles.get(id)).filter((t): t is string => Boolean(t));
      })
      .catch(() => [] as string[])
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/members", label: "Members" }}
        title={memberDisplayName(member)}
        description="What the community knows about this member. Only admins can see this page."
      />
      <MemberProfileClient initialMember={member} groupNames={groupNames} officerTitles={officerTitles} />
    </div>
  );
}
