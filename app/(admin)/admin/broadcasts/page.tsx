import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import BroadcastsClient, { type BroadcastSummary } from "@/src/components/admin/broadcasts/BroadcastsClient";
import { emailSetupProblem } from "@/src/components/admin/broadcasts/sendingSetup.server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { audienceOptions } from "@/src/lib/broadcastAudience.server";
import type { AudienceOptions } from "@/src/lib/broadcast.shared";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listBroadcasts } from "@/src/lib/adminData.server";

/** Tab title: "Broadcasts · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Broadcasts" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Everyone and each turned-on group, with how many could be emailed today; null if it can't be counted (the page still works). */
async function loadAudienceOptions(): Promise<AudienceOptions | null> {
  try {
    return await audienceOptions();
  } catch {
    return null;
  }
}

export default async function BroadcastsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/broadcasts");
    throw error;
  }
  const broadcasts = (await listBroadcasts(await requireActiveAdmin(undefined, COMMUNITY_SLUG))) as BroadcastSummary[];
  const options = await loadAudienceOptions();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Broadcasts" description="Email announcements to members who agreed, and text for the group chats. Two admins check each one." />
      <BroadcastsClient initial={broadcasts ?? []} recipientCount={options ? options.all : null} audienceOptions={options} emailProblem={emailSetupProblem()} />
    </div>
  );
}
