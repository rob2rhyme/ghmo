import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import BroadcastsClient, { type BroadcastSummary } from "@/src/components/admin/broadcasts/BroadcastsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BroadcastsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/broadcasts");
    throw error;
  }
  const res = await internalFetch("/api/admin/broadcasts");
  if (!res.ok) throw new Error(`Failed to load broadcasts (${res.status})`);
  const { broadcasts } = (await res.json()) as { broadcasts?: BroadcastSummary[] };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Broadcasts" description="Announcements by email to members who agreed, and by copy-and-paste to the Messenger group chats. Two admins check every one before it goes out." />
      <BroadcastsClient initial={broadcasts ?? []} />
    </div>
  );
}
