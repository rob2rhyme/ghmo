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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <AdminPageHeader title="Members" description="Who can be emailed or called, and who has agreed to it. Phone numbers are end-to-end encrypted; nobody is contacted without a recorded consent." />
      <MembersClient initialMembers={members ?? []} />
    </div>
  );
}
