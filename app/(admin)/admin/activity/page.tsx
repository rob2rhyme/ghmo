import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import ActivityClient from "@/src/components/admin/activity/ActivityClient";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Activity · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Activity" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The whole activity log (plan §29). Every admin; device details and the download for super admins. */
export default async function ActivityPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/activity");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Activity" description="Who did what in the admin area, and when. Open an entry to see what changed." />
      <ActivityClient />
    </div>
  );
}
