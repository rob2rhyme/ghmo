import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import BroadcastsClient, { type BroadcastSummary } from "@/src/components/admin/broadcasts/BroadcastsClient";
import { emailSetupProblem } from "@/src/components/admin/broadcasts/sendingSetup.server";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { loadRecipients } from "@/src/lib/broadcastSender.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { listBroadcasts } from "@/src/lib/adminData.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** How many members a broadcast would reach today; null if it can't be counted (the page still works). */
async function countRecipients(): Promise<number | null> {
  try {
    return (await loadRecipients(getAdminDb())).length;
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
  const broadcasts = (await listBroadcasts()) as BroadcastSummary[];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Broadcasts" description="Email announcements to members who agreed, and text for the group chats. Two admins check each one." />
      <BroadcastsClient initial={broadcasts ?? []} recipientCount={await countRecipients()} emailProblem={emailSetupProblem()} />
    </div>
  );
}
