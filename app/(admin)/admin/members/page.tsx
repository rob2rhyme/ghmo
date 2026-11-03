import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MembersClient, { type MemberRow } from "@/src/components/admin/members/MembersClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listMembers } from "@/src/lib/adminData.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembersPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/members");
    throw error;
  }

  const members = (await listMembers()) as MemberRow[];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Members" description="Everyone on the community list, and whether they agreed to be emailed or called." />
      <MembersClient initialMembers={members ?? []} />
    </div>
  );
}
