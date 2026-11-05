import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import GroupClient from "@/src/components/admin/people/GroupClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const metadata: Metadata = { title: "Group" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect(`/admin/login?next=/admin/groups/${encodeURIComponent(groupId)}`);
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Group" description="Who is in this team, and who leads it." />
      <GroupClient groupId={groupId} />
    </div>
  );
}
