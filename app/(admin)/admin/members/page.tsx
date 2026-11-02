import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MembersClient, { type MemberRow } from "@/src/components/admin/members/MembersClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembersPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/members");
    throw error;
  }

  const res = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/members`);
  if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
  const { members } = (await res.json()) as { members?: MemberRow[] };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Members" description="Everyone on the community list, and whether they agreed to email or calls. Nobody is contacted without a recorded yes." />
      <MembersClient initialMembers={members ?? []} />
    </div>
  );
}
