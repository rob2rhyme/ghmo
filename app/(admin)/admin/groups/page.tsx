import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import GroupsClient from "@/src/components/admin/people/GroupsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Groups · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Groups" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/groups");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Groups" description="Teams of members, each with a lead: the phone tree callers, cooks, marketing, shopping and more." />
      <GroupsClient />
    </div>
  );
}
